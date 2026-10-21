"use client";
import SafeImage from "./SafeImage";


import { FormEvent, useEffect, useRef, useState } from "react";
import { prepareImageForUpload } from "../lib/client-image";

type FeedbackType = "PROBLEMA" | "SUGESTAO" | "MELHORIA" | "DENUNCIA";
type OpenFeedbackDetail = {
  type?: FeedbackType;
  entityType?: string;
  entityId?: number;
};

const OPTIONS: Array<{ type: Exclude<FeedbackType, "DENUNCIA">; label: string; icon: string; detail: string }> = [
  { type: "PROBLEMA", label: "Reportar problema", icon: "!", detail: "Descreva o erro; a foto é opcional." },
  { type: "SUGESTAO", label: "Sugestão", icon: "✦", detail: "Compartilhe uma nova ideia." },
  { type: "MELHORIA", label: "Melhoria", icon: "↗", detail: "Indique algo que pode ficar melhor." },
];

const GENERAL_CATEGORIES = [
  ["ERRO_FUNCIONAL", "Erro em uma função"],
  ["PROBLEMA_VISUAL", "Problema visual"],
  ["DESEMPENHO", "Lentidão ou desempenho"],
  ["ACESSIBILIDADE", "Acessibilidade"],
  ["SEGURANCA_PRIVACIDADE", "Segurança ou privacidade"],
  ["NOVA_FUNCIONALIDADE", "Nova funcionalidade"],
  ["USABILIDADE", "Facilidade de uso"],
  ["ORGANIZACAO", "Organização das informações"],
  ["OUTRO", "Outro"],
] as const;

const REPORT_CATEGORIES = [
  ["CONTEUDO_OFENSIVO", "Conteúdo ofensivo"],
  ["ASSEDIO_DISCRIMINACAO", "Assédio ou discriminação"],
  ["SPAM_FRAUDE", "Spam, golpe ou fraude"],
  ["INFORMACAO_FALSA", "Informação falsa ou enganosa"],
  ["DADOS_PESSOAIS", "Exposição de dados pessoais"],
  ["DIREITOS_AUTORAIS", "Violação de direitos autorais"],
  ["CONTEUDO_IMPROPRIO", "Conteúdo impróprio"],
  ["OUTRO", "Outro motivo"],
] as const;

export default function GlobalFeedbackLauncher() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [type, setType] = useState<FeedbackType | null>(null);
  const [entityType, setEntityType] = useState("");
  const [entityId, setEntityId] = useState<number | null>(null);
  const [image, setImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState("");
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const submittingRef = useRef(false);

  useEffect(() => {
    if (!type && !helpOpen) return;
    const dialog = dialogRef.current;
    dialog?.focus();
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !submittingRef.current) { event.preventDefault(); closeDialog(); }
      if (event.key !== "Tab" || !dialog) return;
      const controls = [...dialog.querySelectorAll<HTMLElement>('button:not([disabled]),select,textarea,input:not([hidden]),[tabindex="0"]')].filter(element => element.tabIndex >= 0 && element.getClientRects().length);
      const first = controls[0], last = controls.at(-1);
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog)) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    dialog?.addEventListener("keydown", handleKey);
    return () => {
      dialog?.removeEventListener("keydown", handleKey);
      const trigger = returnFocusRef.current;
      (trigger?.isConnected ? trigger : triggerRef.current)?.focus({ preventScroll: true });
    };
    // Opening and closing the dialog own focus, independently of form updates.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, helpOpen]);

  useEffect(() => {
    const openHelp = () => {
      returnFocusRef.current = document.activeElement as HTMLElement | null;
      setMenuOpen(false);
      setHelpOpen(true);
    };
    window.addEventListener("vinkulo:open-help", openHelp);
    return () => window.removeEventListener("vinkulo:open-help", openHelp);
  }, []);

  useEffect(() => {
    const open = (event: Event) => {
      returnFocusRef.current = document.activeElement as HTMLElement | null;
      const detail = (event as CustomEvent<OpenFeedbackDetail>).detail || {};
      setMenuOpen(false);
      setHelpOpen(false);
      setType(detail.type || "PROBLEMA");
      setEntityType(String(detail.entityType || ""));
      setEntityId(Number(detail.entityId || 0) || null);
      setMessage("");
      setError("");
    };
    window.addEventListener("vinkulo:open-feedback", open);
    return () => window.removeEventListener("vinkulo:open-feedback", open);
  }, []);

  useEffect(() => () => {
    if (imagePreview) URL.revokeObjectURL(imagePreview);
  }, [imagePreview]);

  useEffect(() => {
    if (message) dialogRef.current?.querySelector<HTMLButtonElement>(".global-feedback-success button")?.focus();
  }, [message]);

  function choose(nextType: Exclude<FeedbackType, "DENUNCIA">) {
    if (!helpOpen) returnFocusRef.current = document.activeElement as HTMLElement | null;
    setType(nextType);
    setHelpOpen(false);
    setMenuOpen(false);
    setEntityType("");
    setEntityId(null);
    setMessage("");
    setError("");
  }

  function closeDialog() {
    if (submittingRef.current) return;
    setType(null);
    setHelpOpen(false);
    setImage(null);
    setImagePreview("");
    setMessage("");
    setError("");
  }

  async function selectImage(file?: File) {
    if (!file) return;
    setError("");
    try {
      const prepared = await prepareImageForUpload(file, "feedback-evidence");
      setImage(prepared);
      setImagePreview(URL.createObjectURL(prepared));
    } catch (cause) {
      setError((cause as Error).message);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!type || submittingRef.current) return;
    submittingRef.current = true;
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    form.set("tipo", type);
    form.set("pagina", `${window.location.pathname}${window.location.search}`.slice(0, 300));
    if (entityType) form.set("entidadeTipo", entityType);
    if (entityId) form.set("entidadeId", String(entityId));
    if (image) form.set("imagem", image);
    setWorking(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/feedback", { method: "POST", body: form });
      const result = await readResult(response) as { error?: string; userName?: string };
      if (!response.ok) throw new Error(result.error || "Não foi possível enviar.");
      formElement.reset();
      setImage(null);
      setImagePreview("");
      setMessage(`Recebido, ${result.userName || "obrigado"}. A mensagem está pendente para análise.`);
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      submittingRef.current = false;
      setWorking(false);
    }
  }

  const categories = type === "DENUNCIA" ? REPORT_CATEGORIES : GENERAL_CATEGORIES;
  const title = type === "PROBLEMA" ? "Reportar problema" : type === "SUGESTAO" ? "Enviar sugestão" : type === "MELHORIA" ? "Propor melhoria" : "Denunciar publicação";

  return (
    <>
      <aside className={`global-feedback-launcher${menuOpen ? " open" : ""}`} aria-label="Ajuda e feedback">
        {menuOpen && <div className="global-feedback-menu">{OPTIONS.map((item) => (
          <button key={item.type} type="button" onClick={() => choose(item.type)}>
            <span>{item.icon}</span><div><strong>{item.label}</strong><small>{item.detail}</small></div>
          </button>
        ))}</div>}
        <button ref={triggerRef} className="global-feedback-trigger" type="button" onClick={() => setMenuOpen((value) => !value)} aria-expanded={menuOpen} aria-label="Abrir opções para reportar problema, sugestão ou melhoria">
          <span aria-hidden="true">?</span><strong>Ajuda</strong>
        </button>
      </aside>

      {helpOpen && <div className="global-feedback-backdrop" role="presentation">
        <section ref={dialogRef} tabIndex={-1} className="global-feedback-dialog" role="dialog" aria-modal="true" aria-labelledby="global-help-title">
          <header><div><h2 id="global-help-title">Ajuda</h2><p>Como podemos ajudar?</p></div><button type="button" onClick={closeDialog} aria-label="Fechar">×</button></header>
          <div className="global-feedback-menu global-help-options">{OPTIONS.map((item) => (
            <button key={item.type} type="button" onClick={() => choose(item.type)}>
              <span aria-hidden="true">{item.icon}</span><div><strong>{item.label}</strong><small>{item.detail}</small></div>
            </button>
          ))}</div>
        </section>
      </div>}

      {type && <div className="global-feedback-backdrop" role="presentation">
        <section ref={dialogRef} tabIndex={-1} className="global-feedback-dialog" role="dialog" aria-modal="true" aria-labelledby="global-feedback-title">
          <header><div><small>CENTRAL DE FEEDBACK</small><h2 id="global-feedback-title">{title}</h2><p>Seu nome e esta página serão identificados automaticamente.</p></div><button type="button" onClick={closeDialog} aria-label="Fechar">×</button></header>
          {message ? <div className="global-feedback-success" role="status"><span>✓</span><strong>Mensagem enviada</strong><p>{message}</p><button type="button" onClick={closeDialog}>Concluir</button></div> : <form onSubmit={submit} aria-busy={working}>
            <label>Categoria<select name="categoria" required defaultValue={categories[0][0]} key={type}>{categories.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
            <label>Descreva com detalhes<textarea name="mensagem" required minLength={10} maxLength={3000} rows={5} aria-describedby="feedback-description-hint" placeholder={type === "DENUNCIA" ? "Explique o que há de inadequado nesta publicação" : "Conte o que aconteceu e o que você esperava"} /><small id="feedback-description-hint">De 10 a 3.000 caracteres.</small></label>
            <div className="global-feedback-image-field">
              <span>Foto (opcional)</span>
              <input ref={inputRef} type="file" hidden aria-label="Anexar foto opcional" accept="image/*" onChange={(event) => { void selectImage(event.target.files?.[0]); event.target.value = ""; }} />
              <button type="button" onClick={() => inputRef.current?.click()}>{image ? "Trocar foto" : "Adicionar foto"}</button>
              {imagePreview && <figure><SafeImage loading="lazy" src={imagePreview} alt="Prévia da foto anexada" /><button type="button" onClick={() => { setImage(null); setImagePreview(""); }}>Remover</button></figure>}
              <small>Você pode enviar apenas o texto. Se anexar uma foto, ela será otimizada e salva no seu Google Drive conectado.</small>
            </div>
            {type === "DENUNCIA" && <p className="global-feedback-note">A denúncia será analisada pelo Proprietário. A pessoa denunciada não verá seu nome por este formulário.</p>}
            {error && <p className="global-feedback-error" role="alert">{error}</p>}
            <footer><button type="button" onClick={closeDialog}>Cancelar</button><button type="submit" disabled={working}>{working ? "Enviando…" : "Enviar"}</button></footer>
          </form>}
        </section>
      </div>}
    </>
  );
}

async function readResult(response: Response) {
  const text = await response.text();
  try { return text ? JSON.parse(text) as unknown : {}; }
  catch { return { error: "O servidor retornou uma resposta inválida." }; }
}
