"use client";

import {
  FormEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

const QR_PREFIX = "VINKULO:PARKING:";

export function normalizeParkingQrCode(value: string) {
  const match = value.trim().toUpperCase().match(/VK-[A-F0-9]{8,32}/);
  return match?.[0] || "";
}

export function ParkingReservationQr({
  code,
  label,
  expiresAt,
}: {
  code: string;
  label: string;
  expiresAt?: string | null;
}) {
  const [source, setSource] = useState("");
  const [remaining, setRemaining] = useState(() => remainingMs(expiresAt));

  useEffect(() => {
    let active = true;
    void import("qrcode").then(({ default: QRCode }) =>
      QRCode.toDataURL(`${QR_PREFIX}${code}`, {
        errorCorrectionLevel: "M",
        margin: 2,
        width: 260,
        color: { dark: "#07111fff", light: "#ffffffff" },
      }),
    ).then((value) => {
      if (active) setSource(value);
    });
    return () => {
      active = false;
    };
  }, [code]);

  useEffect(() => {
    const initial = window.setTimeout(() => setRemaining(remainingMs(expiresAt)), 0);
    if (!expiresAt) return () => window.clearTimeout(initial);
    const timer = window.setInterval(() => setRemaining(remainingMs(expiresAt)), 1_000);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(timer);
    };
  }, [expiresAt]);

  return (
    <div className="parking-reservation-qr">
      {source ? (
        <img src={source} alt={`QR Code da reserva ${label}`} />
      ) : (
        <span className="pilot-loader" aria-label="Gerando QR Code" />
      )}
      <div>
        <small>CÓDIGO DE ACESSO</small>
        <strong>{label}</strong>
        <code>{code}</code>
        <p>Apresente este QR Code ao responsável escalado na entrada.</p>
        {expiresAt && <p className={`parking-qr-expiry${remaining <= 0 ? " expired" : ""}`} aria-live="polite">
          {remaining <= 0
            ? `Expirou em ${formatQrTime(expiresAt)}.`
            : <>Válido até {formatQrTime(expiresAt)} <strong>{formatRemaining(remaining)}</strong></>}
        </p>}
      </div>
    </div>
  );
}

function remainingMs(value?: string | null) {
  if (!value) return 0;
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? 0 : Math.max(0, timestamp - Date.now());
}

function formatQrTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("pt-BR", { dateStyle:"short", timeStyle:"short", timeZone:"America/Sao_Paulo" }).format(date);
}

function formatRemaining(milliseconds: number) {
  const seconds = Math.ceil(milliseconds / 1_000);
  const hours = Math.floor(seconds / 3_600);
  const minutes = Math.floor((seconds % 3_600) / 60);
  const rest = seconds % 60;
  return `${hours}h ${minutes}min ${rest}s restantes`;
}

export function ParkingQrCheckin({
  disabled,
  promptOnMount = false,
  onDetected,
}: {
  disabled?: boolean;
  promptOnMount?: boolean;
  onDetected: (code: string) => boolean | void | Promise<boolean | void>;
}) {
  const [open, setOpen] = useState(false);
  const [welcomeOpen, setWelcomeOpen] = useState(promptOnMount);
  const [scanning, setScanning] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [message, setMessage] = useState("");
  const [cameraPermission, setCameraPermission] = useState<"unknown" | "prompt" | "granted" | "denied" | "unsupported">("unknown");
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const frameRef = useRef<number | null>(null);
  const foundRef = useRef(false);
  const decoderRef = useRef<typeof import("jsqr").default | null>(null);
  const startCameraRef = useRef<(preserveMessage?: boolean) => Promise<void>>(async () => undefined);
  const readFrameRef = useRef<() => void>(() => undefined);

  const stopCamera = useCallback(() => {
    if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    foundRef.current = false;
    setScanning(false);
  }, []);

  useEffect(() => stopCamera, [stopCamera]);

  useEffect(() => {
    if (!open) return;
    if (!navigator.mediaDevices?.getUserMedia) {
      const timer = window.setTimeout(() => setCameraPermission("unsupported"), 0);
      return () => window.clearTimeout(timer);
    }
    if (!("permissions" in navigator)) {
      const timer = window.setTimeout(() => setCameraPermission("prompt"), 0);
      return () => window.clearTimeout(timer);
    }
    let active = true;
    let removeListener: () => void = () => undefined;
    void navigator.permissions.query({ name: "camera" as PermissionName }).then((status) => {
      if (!active) return;
      const sync = () => setCameraPermission(status.state as "prompt" | "granted" | "denied");
      sync();
      status.addEventListener("change", sync);
      removeListener = () => status.removeEventListener("change", sync);
    }).catch(() => active && setCameraPermission("prompt"));
    return () => {
      active = false;
      removeListener();
    };
  }, [open]);

  const submitCode = useCallback(async (rawValue: string) => {
    const code = normalizeParkingQrCode(rawValue);
    if (!code) {
      setMessage("Este QR Code não pertence a uma reserva do Vínkulo.");
      return;
    }
    if (foundRef.current) return;
    foundRef.current = true;
    stopCamera();
    setProcessing(true);
    setMessage("Validando reserva…");
    try {
      const accepted = await onDetected(code);
      if (typeof accepted === "string") {
        setMessage(accepted);
        return;
      }
      if (accepted === false) {
        setMessage("Não foi possível liberar esta reserva. Confira o motivo informado e tente o próximo QR Code.");
        window.setTimeout(() => void startCameraRef.current(true), 1700);
        return;
      }
      setMessage("QR Code autenticado. Entrada liberada — o leitor continuará aberto para a próxima reserva.");
      window.setTimeout(() => void startCameraRef.current(true), 1300);
    } finally {
      setProcessing(false);
      foundRef.current = false;
    }
  }, [onDetected, stopCamera]);

  const readFrame = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || foundRef.current || video.readyState < 2) {
      frameRef.current = window.requestAnimationFrame(readFrameRef.current);
      return;
    }
    const width = video.videoWidth;
    const height = video.videoHeight;
    if (!width || !height) {
      frameRef.current = window.requestAnimationFrame(readFrameRef.current);
      return;
    }
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    context?.drawImage(video, 0, 0, width, height);
    if (context) {
      const image = context.getImageData(0, 0, width, height);
      const result = decoderRef.current?.(image.data, width, height, { inversionAttempts: "dontInvert" });
      if (result?.data) {
        void submitCode(result.data);
        return;
      }
    }
    frameRef.current = window.requestAnimationFrame(readFrameRef.current);
  }, [submitCode]);

  useEffect(() => {
    readFrameRef.current = readFrame;
  }, [readFrame]);

  async function startCamera(preserveMessage = false) {
    if (!preserveMessage) setMessage("");
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraPermission("unsupported");
      setMessage("A câmera não está disponível neste aparelho. Digite o código da reserva.");
      return;
    }
    try {
      stopCamera();
      // Ask for camera access before loading the decoder. Some installed mobile
      // browsers only surface the native permission prompt while this call is
      // still directly associated with the user's tap.
      const streamPromise = navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      const decoderPromise = decoderRef.current
        ? Promise.resolve(decoderRef.current)
        : import("jsqr").then(({ default: decoder }) => decoder);
      const [stream, decoder] = await Promise.all([streamPromise, decoderPromise]);
      decoderRef.current = decoder;
      setCameraPermission("granted");
      streamRef.current = stream;
      if (!videoRef.current) {
        await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
      }
      const video = videoRef.current;
      if (!video) {
        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        throw new Error("O leitor ainda não está pronto. Toque em tentar novamente.");
      }
      video.srcObject = stream;
      video.setAttribute("playsinline", "true");
      await video.play();
      setScanning(true);
      frameRef.current = window.requestAnimationFrame(readFrame);
    } catch (cause) {
      const denied = (cause as DOMException).name === "NotAllowedError" || (cause as DOMException).name === "SecurityError";
      if (denied) setCameraPermission("denied");
      setMessage(denied
        ? "A câmera está bloqueada. Abra as permissões deste site ou aplicativo, permita Câmera e toque em Tentar novamente."
        : "Não foi possível abrir a câmera. Você ainda pode digitar o código da reserva.");
    }
  }

  useEffect(() => {
    startCameraRef.current = startCamera;
  });

  function openScanner() {
    setOpen(true);
    setCameraPermission("prompt");
    // Opening the reader is itself the permission gesture. This avoids asking
    // the user to open the dialog and then tap a second button.
    void startCamera();
  }

  function submitManual(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const code = String(new FormData(event.currentTarget).get("codigo") || "");
    void submitCode(code);
  }

  function close() {
    stopCamera();
    setOpen(false);
    setMessage("");
  }

  return (
    <>
      <button
        type="button"
        className="parking-qr-open"
        disabled={disabled}
        onClick={openScanner}
      >
        <span aria-hidden="true">▦</span>
        <strong>Ler QR Code</strong>
        <small>Câmera ou código</small>
      </button>
      {welcomeOpen && (
        <div className="parking-qr-backdrop parking-qr-welcome-backdrop" role="presentation">
          <section className="parking-qr-welcome" role="dialog" aria-modal="true" aria-labelledby="parking-qr-welcome-title">
            <span aria-hidden="true">▦</span>
            <div><small>PORTARIA DIGITAL</small><h2 id="parking-qr-welcome-title">Deseja ler um QR Code?</h2><p>Use a câmera para validar rapidamente a primeira reserva deste plantão.</p></div>
            <footer><button type="button" onClick={() => setWelcomeOpen(false)}>Agora não</button><button type="button" onClick={() => { setWelcomeOpen(false); openScanner(); }}>Ler QR Code</button></footer>
          </section>
        </div>
      )}
      {open && (
        <div className="parking-qr-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && close()}>
          <section className="parking-qr-dialog" role="dialog" aria-modal="true" aria-labelledby="parking-qr-title">
            <header>
              <div><small>CHECK-IN DE RESERVA</small><h2 id="parking-qr-title">Ler QR Code</h2></div>
              <button type="button" onClick={close} aria-label="Fechar leitor">×</button>
            </header>
            <div className={`parking-qr-camera${scanning ? " active" : ""}`}>
              <video ref={videoRef} muted autoPlay playsInline aria-label="Visualização da câmera" />
              <span aria-hidden="true" />
              {!scanning && <button type="button" disabled={processing} onClick={() => void startCamera()}>{cameraPermission === "denied" ? "Tentar novamente" : "Permitir câmera"}</button>}
            </div>
            {!scanning && <section className={`parking-camera-permission status-${cameraPermission}`} aria-live="polite">
              <strong>{cameraPermission === "granted" ? "Câmera autorizada" : cameraPermission === "denied" ? "Permissão bloqueada" : "Confirmação necessária"}</strong>
              <p>{cameraPermission === "denied" ? "No aplicativo: abra Configurações do celular › Aplicativos › Vínkulo › Permissões › Câmera e escolha Permitir. No navegador, use o cadeado ao lado do endereço." : "O celular mostrará agora a confirmação de acesso. O Vínkulo usa a câmera somente durante a leitura."}</p>
            </section>}
            <canvas ref={canvasRef} hidden />
            <div className="parking-qr-alternatives parking-qr-manual-only">
              <form onSubmit={submitManual}>
                <label><span>Ou digite o código</span><input name="codigo" placeholder="VK-XXXXXXXX" required /></label>
                <button disabled={processing}>Validar</button>
              </form>
            </div>
            {message && <p className="parking-qr-message" role="status">{message}</p>}
            <footer>O QR contém somente um token de reserva. Os dados pessoais são consultados no servidor após a leitura.</footer>
          </section>
        </div>
      )}
    </>
  );
}
