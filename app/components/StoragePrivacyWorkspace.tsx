"use client";

import { useEffect, useState } from "react";

type StorageData = {
  googleAvailable: boolean;
  google: null | { email: string; linked: boolean; connected: boolean; connectedAt: string };
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

  async function load() {
    const response = await fetch("/api/storage/preferences", { cache: "no-store" });
    const result = await response.json() as StorageData;
    if (!response.ok) throw new Error(result.error || "Não foi possível carregar a privacidade.");
    setData(result);
  }

  useEffect(() => {
    const params = new URL(window.location.href).searchParams;
    const timer = window.setTimeout(() => {
      setMessage(params.get("google") === "connected" ? "Google Drive conectado com sucesso." : params.get("googleErro") || "");
      void load().catch((error) => setMessage((error as Error).message));
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
      setMessage("Pasta da comunidade criada no Google Drive.");
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function migrateHistory() {
    setBusy(true);
    setMessage("Migrando o histórico com segurança…");
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
      setMessage(complete
        ? `Migração concluída. ${migrated} item(ns) foram confirmados no Drive antes da remoção da plataforma.`
        : `Migração parcial concluída (${migrated} item(ns)). Execute novamente para continuar.`);
    } catch (error) {
      setMessage((error as Error).message);
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
      setMessage("Google Drive desconectado. O destino voltou para este aparelho.");
    } catch (error) {
      setMessage((error as Error).message);
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
          <a className="storage-connect-google" href="/api/auth/google/start?purpose=drive&returnTo=%2Fpainel%3Fview%3Dconta">Conectar Google Drive</a>
        ) : (
          <button type="button" disabled={busy} onClick={() => void disconnect()}>Desconectar Drive</button>
        )}
      </div>

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
    </section>
  );
}

function migrationLabel(status: string) {
  if (status === "COMPLETE") return "concluída";
  if (status === "IN_PROGRESS") return "em andamento";
  if (status === "FAILED") return "precisa de revisão";
  return "aguardando autorização";
}
