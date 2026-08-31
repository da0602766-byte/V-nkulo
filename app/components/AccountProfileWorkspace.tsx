"use client";

import { FormEvent, useEffect, useState } from "react";
import NativeImageUpload from "./NativeImageUpload";
import StoragePrivacyWorkspace from "./StoragePrivacyWorkspace";

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
  const [message, setMessage] = useState("");
  const [photoUrl, setPhotoUrl] = useState("");

  useEffect(() => {
    fetch("/api/conta/perfil", { cache: "no-store" })
      .then(async (response) => {
        const result = (await response.json()) as AccountResponse;
        if (!response.ok) throw new Error(result.error || "Falha ao carregar.");
        setData(result);
        setPhotoUrl(result.account?.fotoPerfil || "");
      })
      .catch((error) => setMessage(error.message))
      .finally(() => setLoading(false));
  }, []);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage("");
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
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p className="people-loading">Carregando sua conta…</p>;
  if (!data.account) return <p className="operations-feedback error">{message}</p>;
  return (
    <section className={`account-profile-workspace ${neutral ? "neutral" : ""}`}>
      <header className="workspace-heading">
        <div>
          <p className="pilot-kicker">MINHA CONTA</p>
          <h1>Informações e privacidade</h1>
          <p>
            Os campos obrigatórios são definidos pelo proprietário da plataforma.
            Você decide quais informações adicionais ficam privadas.
          </p>
        </div>
      </header>
      <StoragePrivacyWorkspace />
      <form className="account-profile-form" onSubmit={save}>
        <section className="account-profile-section">
          <header>
            <span>1</span>
            <div><strong>Identidade da conta</strong><small>Foto, nome e dados essenciais.</small></div>
          </header>
          <NativeImageUpload
            label="Foto de perfil"
            value={photoUrl}
            purpose="profile-photo"
            onChange={setPhotoUrl}
            help="Sua foto aparece no cabeçalho e no seu perfil. Imagens de até 50 MB são convertidas automaticamente para WebP."
          />
          <div className="account-profile-grid">
            <label>
              Nome completo
              <input name="nome" defaultValue={data.account.nome} required minLength={3} maxLength={120} pattern="[A-Za-zÀ-ÿ' -]{3,120}" autoComplete="name" title="Use apenas letras, espaços, apóstrofo ou hífen." />
            </label>
            <label>
              E-mail
              <input value={data.account.email} disabled aria-describedby="email-note" />
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
        <details className="account-profile-section account-profile-collapsible" open>
          <summary>
            <span>2</span>
            <div><strong>Informações complementares</strong><small>Recolha esta seção para facilitar a leitura.</small></div>
            <b aria-hidden="true">⌄</b>
          </summary>
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
                    defaultChecked={field.private}
                  />
                  Manter privado
                </label>
              </div>
            )) : <p className="account-profile-empty">Nenhum campo complementar foi solicitado.</p>}
          </div>
        </details>
        {message && <p className="operations-feedback" role="status">{message}</p>}
        <button className="account-profile-submit" type="submit" disabled={saving}>
          {saving ? "Salvando…" : "Salvar minha conta"}
        </button>
      </form>
    </section>
  );
}
