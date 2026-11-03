"use client";

import TransientFeedback from "./TransientFeedback";

import { FormEvent, useEffect, useRef, useState } from "react";
import NativeImageUpload from "./NativeImageUpload";
import StoragePrivacyWorkspace from "./StoragePrivacyWorkspace";
import "./account-profile-ux.css";

type DynamicField = {
  id: string;
  label: string;
  type: "text" | "tel" | "number" | "date" | "textarea";
  placeholder: string;
  required: boolean;
  value: string;
  private: boolean;
};

type AccountResponse = {
  account?: {
    nome: string;
    email: string;
    telefone: string;
    dataNascimento: string;
    endereco: string;
    fotoPerfil: string;
    criadoEm: string;
    biografia: string;
  };
  fields?: DynamicField[];
  error?: string;
};

export default function AccountProfileWorkspace({
  neutral = false,
}: {
  neutral?: boolean;
}) {
  const [data, setData] = useState<AccountResponse>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [message, setMessage] = useState("");
  const [loadError, setLoadError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [revision, setRevision] = useState(0);
  const savingRef = useRef(false);
  const [photoUrl, setPhotoUrl] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/conta/perfil", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const result = (await response.json()) as AccountResponse;
        if (controller.signal.aborted) return;
        if (!response.ok || !result.account) throw new Error(result.error || "Não foi possível carregar sua conta.");
        setData(result);
        setPhotoUrl(result.account?.fotoPerfil || "");
      })
      .catch((error) => { if (!controller.signal.aborted) setLoadError(error.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [revision]);

  function retry() {
    setLoadError("");
    setLoading(true);
    setRevision(value => value + 1);
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setMessage("");
    setSaveError("");
    const form = new FormData(event.currentTarget);
    const fields: Record<string, string> = {};
    const privacy: Record<string, boolean> = {};
    for (const field of data.fields || []) {
      fields[field.id] = String(form.get(`field:${field.id}`) || "");
      privacy[field.id] = form.get(`private:${field.id}`) === "on";
    }
    try {
      const response = await fetch("/api/conta/perfil", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nome: form.get("nome"),
          dataNascimento: form.get("dataNascimento"),
          biografia: form.get("biografia"),
          fotoPerfil: photoUrl,
          fields,
          privacy,
        }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error || "Falha ao salvar.");
      setMessage("Informações da conta atualizadas.");
      setDirty(false);
    } catch (error) {
      setSaveError((error as Error).message);
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  if (loading) return <p className="people-loading" role="status">Carregando sua conta…</p>;
  if (!data.account) return <section className="account-profile-load-error"><p role="alert">{loadError}</p><button type="button" onClick={retry}>Tentar novamente</button></section>;
  return (
    <section className={`account-profile-workspace ${neutral ? "neutral" : ""}`}>
      <header className="workspace-heading">
        <div>
          <p className="pilot-kicker">MINHA CONTA</p>
          <h1>Meu perfil e privacidade</h1>
          <p>
            Atualize sua apresentação e escolha quais informações adicionais ficam privadas.
          </p>
        </div>
      </header>
      <nav className="account-profile-shortcuts" aria-label="Seções da minha conta">
        <a href="#account-identity">Meu perfil</a>
        <a href="#account-additional">Dados complementares</a>
        <a href="#account-storage">Arquivos e Google Drive</a>
      </nav>
      <form id="account-identity" className="account-profile-form" onSubmit={save} onChange={() => setDirty(true)} aria-busy={saving}>
        <p className="workspace-form-state" data-dirty={dirty} role="status">{saving ? "Salvando suas alterações…" : dirty ? "Você tem alterações não salvas. Use Salvar ao concluir." : message || "Seus dados só mudam quando você salva."}</p>
        <p className="account-required-note">* Campo obrigatório. As opções de privacidade abaixo são salvas com seus dados.</p>
        <fieldset className="account-profile-fields" disabled={saving}>
          <legend className="sr-only">Dados do perfil</legend>
        <section className="account-profile-section">
          <header>
            <span>1</span>
            <div><h2>Identidade da conta</h2><small>Foto, nome e dados essenciais.</small></div>
          </header>
          <NativeImageUpload
            label="Foto de perfil"
            value={photoUrl}
            purpose="profile-photo"
            onChange={value => { setPhotoUrl(value); setDirty(true); }}
            help="Sua foto aparece no cabeçalho e no seu perfil. Imagens de até 50 MB são convertidas automaticamente para WebP."
          />
          <div className="account-profile-grid">
            <label>
              Nome completo *
              <input name="nome" defaultValue={data.account.nome} required minLength={3} maxLength={120} pattern="[A-Za-zÀ-ÿ' -]{3,120}" autoComplete="name" title="Use apenas letras, espaços, apóstrofo ou hífen." />
            </label>
            <label>
              E-mail
              <input type="email" value={data.account.email} readOnly aria-describedby="email-note" />
              <small id="email-note">O e-mail da conta não é alterado por este formulário.</small>
            </label>
            <label>
              Data de nascimento
              <input name="dataNascimento" type="date" defaultValue={data.account.dataNascimento} />
            </label>
            <label className="account-biography-field">
              Biografia na comunidade
              <textarea
                name="biografia"
                defaultValue={data.account.biografia}
                maxLength={500}
                rows={4}
                placeholder="Conte brevemente sobre você, sua participação e seus interesses."
              />
              <small>Esta apresentação pode ser vista por integrantes da mesma comunidade.</small>
            </label>
          </div>
        </section>
        <section id="account-additional" className="account-profile-section">
          <header>
            <span>2</span>
            <div><h2>Informações complementares</h2><small>Revise seus dados e a privacidade de cada campo.</small></div>
          </header>
          <div className="account-profile-grid">
            {(data.fields || []).length ? (data.fields || []).map((field) => (
              <div className="account-dynamic-field" key={field.id}>
                <label>
                  {field.label}{field.required ? " *" : ""}
                  {field.type === "textarea" ? (
                    <textarea
                      name={`field:${field.id}`}
                      defaultValue={field.value}
                      placeholder={field.placeholder}
                      required={field.required}
                    />
                  ) : (
                    <input
                      name={`field:${field.id}`}
                      type={field.type}
                      defaultValue={field.value}
                      placeholder={field.placeholder}
                      required={field.required}
                      inputMode={field.type === "tel" ? "tel" : field.id.toLowerCase().includes("cep") ? "numeric" : undefined}
                      autoComplete={field.type === "tel" ? "tel" : field.id.toLowerCase().includes("cep") ? "postal-code" : undefined}
                      pattern={field.type === "tel" ? "[0-9()+ .-]{10,20}" : field.id.toLowerCase().includes("cep") ? "[0-9. -]{8,10}" : undefined}
                      maxLength={field.type === "tel" ? 20 : field.id.toLowerCase().includes("cep") ? 10 : undefined}
                    />
                  )}
                </label>
                <label className="account-private-toggle">
                  <input
                    name={`private:${field.id}`}
                    type="checkbox"
                    aria-label={`Manter ${field.label} privado`}
                    defaultChecked={field.private}
                  />
                  Manter privado
                </label>
              </div>
            )) : <p className="account-profile-empty">Nenhum campo complementar foi solicitado.</p>}
          </div>
        </section>
        </fieldset>
        {saveError && <p className="account-profile-save-error" role="alert">{saveError} Seus dados continuam no formulário. Tente salvar novamente.</p>}
        {message && <TransientFeedback tone="success" role="status">{message}</TransientFeedback>}
        <button className="account-profile-submit" type="submit" disabled={saving}>
          {saving ? "Salvando…" : "Salvar minha conta"}
        </button>
      </form>
      <div id="account-storage"><StoragePrivacyWorkspace /></div>
    </section>
  );
}
