"use client";

import { useEffect, useState } from "react";
import GoogleStatusToast, { type GoogleToastState } from "./GoogleStatusToast";

type StorageData = {
  googleAvailable: boolean;
  google: null | { email: string; linked: boolean; connected: boolean; connectedAt: string; scopes: string };
  preference: {
    provider: "LOCAL" | "GOOGLE_DRIVE";
    auto_load_recent: number;
    auto_download_files: number;
  };
  communityStorage: null | {
    status_migracao: string;
    migrado_em: string | null;
    proprietario_nome: string;
  };
  canConfigureCommunity: boolean;
  error?: string;
};

export default function StoragePrivacyWorkspace() {
  const [data, setData] = useState<StorageData | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [googleToast, setGoogleToast] = useState<GoogleToastState>(null);

  async function load() {
    const response = await fetch("/api/storage/preferences", { cache: "no-store" });
    const result = await response.json() as StorageData;
    if (!response.ok) throw new Error(result.error || "Não foi possível carregar a privacidade.");
    setData(result);
  }

  useEffect(() => {
    const params = new URL(window.location.href).searchParams;
    const timer = window.setTimeout(() => {
      // O callback do Google devolve o resultado na URL. Antes ele virava um
      // parágrafo estático no rodapé do cartão e a autorização parecia não ter
      // acontecido.
      const failure = params.get("googleErro");
      if (params.get("google") === "connected") {
        setGoogleToast({
          variant: "success",
          title: "Google Drive conectado",
          detail: "Arquivos que o Vínkulo criar ficam na sua Conta Google.",
        });
      } else if (failure) {
        setGoogleToast({ variant: "error", title: "Não foi possível conectar o Drive", detail: failure });
      }
      void load().catch((error) =>
        setGoogleToast({ variant: "error", title: "Não foi possível carregar", detail: (error as Error).message }),
      );
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  async function savePreference(next: Partial<{
    provider: "LOCAL" | "GOOGLE_DRIVE";
    autoLoadRecent: boolean;
    autoDownloadFiles: boolean;
  }>) {
    if (!data) return;
    setBusy(true);
    setMessage("");
    const payload = {
      provider: next.provider || data.preference.provider,
      autoLoadRecent: next.autoLoadRecent ?? Boolean(data.preference.auto_load_recent),
      autoDownloadFiles: next.autoDownloadFiles ?? Boolean(data.preference.auto_download_files),
    };
    try {
      const response = await fetch("/api/storage/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "Não foi possível salvar a preferência.");
      await load();
      setMessage("Preferências de privacidade atualizadas.");
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function configureCommunity() {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/storage/community", { method: "POST" });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "Não foi possível configurar o Drive da comunidade.");
      await load();
      setGoogleToast({
        variant: "success",
        title: "Pasta da comunidade criada",
        detail: "Publicações, banners e conversas compartilhadas passam a usar esta pasta.",
      });
    } catch (error) {
      setGoogleToast({
        variant: "error",
        title: "Não foi possível criar a pasta",
        detail: (error as Error).message,
      });
    } finally {
      setBusy(false);
    }
  }

  async function migrateHistory() {
    setBusy(true);
    setGoogleToast({
      variant: "pending",
      title: "Migrando o histórico",
      detail: "Cada item é confirmado no Drive antes de sair da plataforma.",
    });
    try {
      let complete = false;
      let migrated = 0;
      for (let attempt = 0; attempt < 10 && !complete; attempt += 1) {
        const response = await fetch("/api/storage/migrate", { method: "POST" });
        const result = await response.json() as {
          error?: string;
          migratedChats?: number;
          migratedMedia?: number;
          complete?: boolean;
        };
        if (!response.ok) throw new Error(result.error || "Não foi possível migrar o histórico.");
        migrated += Number(result.migratedChats || 0) + Number(result.migratedMedia || 0);
        complete = result.complete === true;
        if (!complete && Number(result.migratedChats || 0) + Number(result.migratedMedia || 0) === 0) break;
      }
      await load();
      setGoogleToast({
        variant: "success",
        title: complete ? "Migração concluída" : "Migração parcial concluída",
        detail: complete
          ? `${migrated} item(ns) confirmados no Drive antes de sair da plataforma.`
          : `${migrated} item(ns) migrados. Execute novamente para continuar.`,
      });
    } catch (error) {
      setGoogleToast({
        variant: "error",
        title: "A migração parou",
        detail: (error as Error).message,
      });
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    if (!window.confirm("Desconectar o Drive? Arquivos já salvos continuarão na sua Conta Google, mas o Vínkulo deixará de acessá-los.")) return;
    setBusy(true);
    try {
      const response = await fetch("/api/storage/preferences", { method: "DELETE" });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "Não foi possível desconectar.");
      await load();
      setGoogleToast({
        variant: "success",
        title: "Google Drive desconectado",
        detail: "O destino dos seus arquivos voltou para este aparelho.",
      });
    } catch (error) {
      setGoogleToast({
        variant: "error",
        title: "Não foi possível desconectar",
        detail: (error as Error).message,
      });
    } finally {
      setBusy(false);
    }
  }

  if (!data) return <section className="storage-privacy-card" aria-busy="true"><p>Carregando privacidade e armazenamento…</p></section>;
  const driveConnected = Boolean(data.google?.connected);
  return (
    <section className="storage-privacy-card" aria-labelledby="storage-privacy-title">
      <header>
        <span aria-hidden="true">☁</span>
        <div>
          <p className="pilot-kicker">PRIVACIDADE E ARMAZENAMENTO</p>
          <h2 id="storage-privacy-title">Seus conteúdos não ficam no Vínkulo</h2>
          <p>Fotos, arquivos e conteúdo de conversas ficam no Google Drive autorizado ou somente neste aparelho. A plataforma guarda apenas referências técnicas, consentimentos e permissões.</p>
        </div>
      </header>

      <div className="storage-google-identity" role="status">
        <span>Conta Google</span>
        {data.google?.linked
          ? <b className="is-linked">Vinculada · {data.google.email}</b>
          : <b className="is-unlinked">Não vinculada</b>}
      </div>

      <div className="storage-destination-grid">
        <button type="button" className={data.preference.provider === "GOOGLE_DRIVE" ? "selected" : ""} disabled={busy || !driveConnected} onClick={() => void savePreference({ provider: "GOOGLE_DRIVE" })}>
          <strong>Google Drive</strong>
          <span>{driveConnected ? `Conectado como ${data.google?.email}` : "Conecte sua Conta Google para usar em outros aparelhos."}</span>
          <small>Sincroniza conteúdos autorizados sem criar cópia no armazenamento do Vínkulo.</small>
        </button>
        <button type="button" className={data.preference.provider === "LOCAL" ? "selected" : ""} disabled={busy} onClick={() => void savePreference({ provider: "LOCAL" })}>
          <strong>Somente neste aparelho</strong>
          <span>Privado e sem sincronização.</span>
          <small>Pode ser perdido ao limpar o navegador, desinstalar o aplicativo ou trocar de celular.</small>
        </button>
      </div>

      <div className="storage-google-actions">
        {!data.googleAvailable ? (
          <p role="status">A integração está pronta, mas o proprietário ainda precisa ativar as credenciais Google.</p>
        ) : !driveConnected ? (
          <a
            className="storage-connect-google"
            href="/api/auth/google/start?purpose=drive&returnTo=%2Fpainel%3Fview%3Dconta"
            onClick={() => setGoogleToast({
              variant: "pending",
              title: "Abrindo a Conta Google",
              detail: "Autorize o acesso ao Drive na janela do Google.",
            })}
          >Conectar Google Drive</a>
        ) : (
          <button type="button" disabled={busy} onClick={() => void disconnect()}>Desconectar Drive</button>
        )}
      </div>

      {driveConnected && (
        <dl className="storage-google-evidence">
          <div><dt>Conta autorizada</dt><dd>{data.google?.email}</dd></div>
          <div><dt>Autorizado em</dt><dd>{formatConnectedAt(data.google?.connectedAt)}</dd></div>
          <div><dt>Permissões concedidas</dt><dd>{describeScopes(data.google?.scopes)}</dd></div>
        </dl>
      )}

      <fieldset className="storage-download-controls" disabled={busy}>
        <legend>Carregamento e download</legend>
        <label>
          <input type="checkbox" checked={Boolean(data.preference.auto_load_recent)} onChange={(event) => void savePreference({ autoLoadRecent: event.target.checked })} />
          <span><strong>Carregar os mais recentes automaticamente</strong><small>Mostra mensagens recentes e prévias leves quando você abre a área.</small></span>
        </label>
        <label>
          <input type="checkbox" checked={Boolean(data.preference.auto_download_files)} onChange={(event) => void savePreference({ autoDownloadFiles: event.target.checked })} />
          <span><strong>Permitir baixar arquivos neste aparelho</strong><small>Desativado por padrão. Quando desligado, os botões de download ficam bloqueados.</small></span>
        </label>
      </fieldset>

      {data.canConfigureCommunity && (
        <section className="storage-community-status">
          <div>
            <strong>Drive da comunidade</strong>
            <p>{data.communityStorage
              ? `Configurado por ${data.communityStorage.proprietario_nome}. Migração: ${migrationLabel(data.communityStorage.status_migracao)}.`
              : "Ainda não configurado. Publicações, banners e conversas compartilhadas precisam desta pasta."}</p>
          </div>
          {!data.communityStorage && driveConnected && <button type="button" disabled={busy} onClick={() => void configureCommunity()}>Criar pasta da comunidade</button>}
          {data.communityStorage && data.communityStorage.status_migracao !== "COMPLETE" && driveConnected && (
            <button type="button" disabled={busy} onClick={() => void migrateHistory()}>Migrar histórico agora</button>
          )}
        </section>
      )}

      <ul className="storage-privacy-facts">
        <li>O Vínkulo não guarda uma segunda cópia de fotos, arquivos ou mensagens novas.</li>
        <li>O usuário pode negar o Drive e manter conteúdo privado somente no aparelho.</li>
        <li>Conteúdo antigo só será apagado da plataforma depois da migração confirmada.</li>
      </ul>
      {message && <p className="operations-feedback" role="status">{message}</p>}

      <GoogleStatusToast state={googleToast} onDismiss={() => setGoogleToast(null)} />
    </section>
  );
}

function migrationLabel(status: string) {
  if (status === "COMPLETE") return "concluída";
  if (status === "IN_PROGRESS") return "em andamento";
  if (status === "FAILED") return "precisa de revisão";
  return "aguardando autorização";
}

function formatConnectedAt(value?: string) {
  const parsed = Date.parse(String(value || "").replace(" ", "T") + "Z");
  if (!Number.isFinite(parsed)) return "—";
  return new Date(parsed).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

const SCOPE_LABELS: Record<string, string> = {
  openid: "Identificação da conta",
  email: "Endereço de e-mail",
  profile: "Nome e foto do perfil",
  "https://www.googleapis.com/auth/drive.file": "Arquivos que o Vínkulo cria no seu Drive",
};

function describeScopes(scopes?: string) {
  const labels = String(scopes || "")
    .split(/\s+/)
    .filter(Boolean)
    .map((scope) => SCOPE_LABELS[scope] || scope);
  return labels.length ? labels.join(" · ") : "—";
}
