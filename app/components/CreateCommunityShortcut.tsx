"use client";

import Link from "./StableLink";
import { FormEvent, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { CommunityCreationField } from "../lib/community-creation";
import {
  COMMUNITY_MODULES,
  DEFAULT_COMMUNITY_MODULES,
  toggleCommunityModule,
  type CommunityModuleKey,
} from "../lib/community-modules";

export default function CreateCommunityShortcut({
  signedIn,
  compact = false,
}: {
  signedIn: boolean;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState("");
  const [fields, setFields] = useState<CommunityCreationField[]>([]);
  const [loadingForm, setLoadingForm] = useState(false);
  const [step, setStep] = useState(1);
  const [selectedModules, setSelectedModules] = useState<CommunityModuleKey[]>(
    DEFAULT_COMMUNITY_MODULES,
  );
  const formRef = useRef<HTMLFormElement>(null);

  function closeDialog() {
    setOpen(false);
    setStep(1);
    setMessage("");
  }

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeDialog();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  async function openDialog() {
    setStep(1);
    setMessage("");
    setOpen(true);
    if (fields.length) return;
    setLoadingForm(true);
    try {
      const response = await fetch("/api/pilot/community-creation-config", { cache: "no-store" });
      const result = await readJson<{ fields?: CommunityCreationField[]; error?: string }>(response);
      if (!response.ok) throw new Error(result.error || "Não foi possível carregar a ficha.");
      setFields(result.fields || []);
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setLoadingForm(false);
    }
  }

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setWorking(true);
    setMessage("");
    try {
      const response = await fetch("/api/pilot/comunidades", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nome: form.get("nome"),
          cidade: form.get("cidade"),
          descricao: form.get("descricao"),
          emailInstitucional: form.get("emailInstitucional"),
          extraFields: Object.fromEntries(
            fields.map((field) => [field.id, form.get(`extra_${field.id}`)]),
          ),
          modules: selectedModules,
        }),
      });
      const result = await readJson<{
        error?: string;
        message?: string;
      }>(response);
      if (!response.ok) {
        throw new Error(result.error || "Não foi possível criar a comunidade.");
      }
      formElement.reset();
      setMessage(
        result.message ||
          "Solicitação enviada. O proprietário fará a análise e a ativação.",
      );
      setStep(3);
      setWorking(false);
    } catch (error) {
      setMessage((error as Error).message);
      setWorking(false);
    }
  }

  function nextStep() {
    const panel = formRef.current?.querySelector<HTMLElement>(`[data-community-step="${step}"]`);
    const controls = Array.from(
      panel?.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(
        "input, textarea, select",
      ) || [],
    );
    const invalid = controls.find((control) => !control.checkValidity());
    if (invalid) {
      invalid.reportValidity();
      invalid.focus();
      return;
    }
    setStep((current) => Math.min(3, current + 1));
    document.querySelector(".create-community-dialog-v81")?.scrollTo({ top: 0, behavior: "smooth" });
  }

  if (!signedIn) {
    return (
      <Link
        className={`create-community-shortcut ${compact ? "compact" : ""}`}
        href="/login"
        aria-label={compact ? "Entrar para solicitar uma comunidade" : undefined}
      >
        <span aria-hidden="true">＋</span>
        <div>
          <strong>{compact ? "Solicitar" : "Solicitar comunidade"}</strong>
          {!compact && <small>Entre para enviar a ficha</small>}
        </div>
      </Link>
    );
  }

  return (
    <>
      <button
        type="button"
        className={`create-community-shortcut ${compact ? "compact" : ""}`}
        onClick={() => void openDialog()}
        aria-label={compact ? "Solicitar uma comunidade" : undefined}
      >
        <span aria-hidden="true">＋</span>
        <div>
          <strong>{compact ? "Solicitar" : "Solicitar uma comunidade"}</strong>
          {!compact && <small>Criação exclusiva pelo proprietário</small>}
        </div>
      </button>
      {open && createPortal(
        <div
          className="create-community-backdrop create-community-backdrop-v81"
          data-editor-key="criar-comunidade-fundo"
          onMouseDown={closeDialog}
        >
          <section
            className="create-community-dialog create-community-dialog-v81"
            data-editor-key="criar-comunidade-dialogo"
            role="dialog"
            aria-modal="true"
            aria-labelledby="create-community-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header className="create-community-dialog-header-v81">
              <div>
                <p className="pilot-kicker">SOLICITAÇÃO DE NOVA COMUNIDADE</p>
                <h2 id="create-community-title">Solicite um novo espaço</h2>
                <p>
                  Preencha a ficha institucional. Nenhuma comunidade será criada
                  automaticamente: o proprietário revisará e ativará o espaço.
                </p>
              </div>
              <button
                type="button"
                onClick={closeDialog}
                aria-label="Fechar"
              >
                ×
              </button>
            </header>
            <nav className="create-community-progress create-community-progress-v81" aria-label="Etapas da criação">
              {[
                [1, "Identidade", "Dados essenciais"],
                [2, "Instituição", "Ficha configurável"],
                [3, "Revisão", "Envio ao proprietário"],
              ].map(([number, title, subtitle]) => (
                <button
                  key={number}
                  type="button"
                  className={step === number ? "active" : step > Number(number) ? "done" : ""}
                  onClick={() => Number(number) < step && setStep(Number(number))}
                  disabled={Number(number) > step}
                  aria-current={step === Number(number) ? "step" : undefined}
                >
                  <span>{step > Number(number) ? "✓" : number}</span>
                  <div><strong>{title}</strong><small>{subtitle}</small></div>
                </button>
              ))}
            </nav>
            <form
              ref={formRef}
              className="pilot-form create-community-form create-community-form-v81"
              data-editor-key="ficha-criacao-comunidade-v2"
              onSubmit={create}
            >
              <fieldset
                className="create-community-section create-community-section-v81"
                data-community-step="1"
                hidden={step !== 1}
              >
                <legend><span>1</span> Identidade e contato</legend>
                <label>
                  Nome público da comunidade
                  <input name="nome" required={step === 1} minLength={3} maxLength={120} />
                </label>
                <label>
                  Cidade e estado
                  <input name="cidade" required={step === 1} minLength={2} maxLength={120} placeholder="Blumenau — SC" />
                </label>
                <label>
                  E-mail institucional
                  <input name="emailInstitucional" type="email" required={step === 1} maxLength={180} />
                </label>
                <label className="composer-wide">
                  Apresentação pública
                  <textarea name="descricao" required={step === 1} minLength={20} maxLength={600} rows={4} />
                </label>
              </fieldset>
              <fieldset
                className="create-community-section create-community-section-v81"
                data-community-step="2"
                hidden={step !== 2}
              >
                <legend><span>2</span> Informações institucionais</legend>
                {loadingForm && <p className="create-community-loading">Carregando ficha configurável…</p>}
                {fields.filter((field) => field.enabled).map((field) => (
                  <label key={field.id} className={field.type === "textarea" ? "composer-wide" : ""}>
                    {field.label}
                    {field.type === "textarea" ? (
                      <textarea
                        name={`extra_${field.id}`}
                        required={step === 2 && field.required}
                        placeholder={field.placeholder}
                        maxLength={500}
                        rows={3}
                      />
                    ) : (
                      <input
                        name={`extra_${field.id}`}
                        type={field.type}
                        required={step === 2 && field.required}
                        placeholder={field.placeholder}
                        maxLength={field.type === "number" ? undefined : 180}
                      />
                    )}
                  </label>
                ))}
                <section className="create-community-modules composer-wide" aria-labelledby="community-modules-title">
                  <header>
                    <div>
                      <strong id="community-modules-title">Abas da comunidade</strong>
                      <small>Escolha os recursos necessários. Dependências são incluídas automaticamente.</small>
                    </div>
                    <span>{selectedModules.length} selecionadas</span>
                  </header>
                  <div>
                    {COMMUNITY_MODULES.map((module) => {
                      const checked = selectedModules.includes(module.key);
                      return (
                        <label key={module.key} className={checked ? "selected" : ""}>
                          <input
                            type="checkbox"
                            name="communityModule"
                            value={module.key}
                            checked={checked}
                            onChange={(event) =>
                              setSelectedModules((current) =>
                                toggleCommunityModule(
                                  current,
                                  module.key,
                                  event.target.checked,
                                ),
                              )
                            }
                          />
                          <span>
                            <strong>{module.label}</strong>
                            <small>{module.description}</small>
                            {module.dependencies.length > 0 && (
                              <em>
                                Inclui também: {module.dependencies.map((dependency) =>
                                  COMMUNITY_MODULES.find((item) => item.key === dependency)?.label,
                                ).join(", ")}
                              </em>
                            )}
                          </span>
                          <i aria-hidden="true">{checked ? "✓" : "+"}</i>
                        </label>
                      );
                    })}
                  </div>
                </section>
              </fieldset>
              <div className="create-community-review create-community-review-v81" data-community-step="3" hidden={step !== 3}>
                <div className="create-community-review-heading">
                  <span>3</span>
                  <div>
                    <strong>Revisão pelo proprietário</strong>
                    <small>A solicitação não cria acesso nem comunidade automaticamente.</small>
                  </div>
                </div>
                <div className="create-community-seal-note">
                  <span aria-hidden="true">✓</span>
                  <div><strong>Ativação manual obrigatória</strong><small>Douglas, proprietário do sistema, poderá revisar dados, ajustar configurações, aprovar ou recusar a solicitação.</small></div>
                </div>
                <ul>
                  <li>Nenhum pastor ou solicitante cria a comunidade diretamente.</li>
                  <li>Dados, membros e permissões permanecem isolados por comunidade.</li>
                  <li>A página institucional e a identidade serão liberadas somente após ativação.</li>
                  <li>{selectedModules.length} abas operacionais serão enviadas para revisão e poderão ser ajustadas pelo proprietário.</li>
                </ul>
              </div>
              {message && (
                <p className="operations-feedback error create-community-feedback-v81" role="alert">
                  {message}
                </p>
              )}
              <footer className="create-community-actions create-community-actions-v81">
                <button type="button" className="secondary" onClick={step === 1 ? closeDialog : () => setStep(step - 1)}>
                  {step === 1 ? "Cancelar" : "Voltar"}
                </button>
                {step < 3 ? (
                  <button type="button" onClick={nextStep} disabled={loadingForm && step === 2}>
                    Continuar
                  </button>
                ) : (
                  <button disabled={working || loadingForm}>
                    {working ? "Enviando…" : "Enviar solicitação ao proprietário"}
                  </button>
                )}
              </footer>
            </form>
          </section>
        </div>,
        document.body,
      )}
    </>
  );
}

async function readJson<T>(response: Response): Promise<T> {
  const text = await response.text();
  if (!text.trim()) return {} as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    return {} as T;
  }
}
