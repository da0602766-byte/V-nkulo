"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { prepareImageForUpload } from "../lib/client-image";

type FeedbackType = "PROBLEMA" | "SUGESTAO" | "MELHORIA" | "DENUNCIA";
type OpenFeedbackDetail = {
  type?: FeedbackType;
  entityType?: string;
  entityId?: number;
};

const OPTIONS: Array<{ type: Exclude<FeedbackType, "DENUNCIA">; label: string; icon: string; detail: string }> = [
  { type: "PROBLEMA", label: "Reportar problema", icon: "!", detail: "Mostre um erro com uma foto." },
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
  const [type, setType] = useState<FeedbackType | null>(null);
  const [entityType, setEntityType] = useState("");
  const [entityId, setEntityId] = useState<number | null>(null);
  const [image, setImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState("");
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const open = (event: Event) => {
      const detail = (event as CustomEvent<OpenFeedbackDetail>).detail || {};
      setMenuOpen(false);
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

  function choose(nextType: Exclude<FeedbackType, "DENUNCIA">) {
    setType(nextType);
    setMenuOpen(false);
    setEntityType("");
    setEntityId(null);
    setMessage("");
    setError("");
  }

  function closeDialog() {
    if (working) return;
    setType(null);
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
    if (!type) return;
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
        <button className="global-feedback-trigger" type="button" onClick={() => setMenuOpen((value) => !value)} aria-expanded={menuOpen} aria-label="Abrir opções para reportar problema, sugestão ou melhoria">
          <span aria-hidden="true">?</span><strong>Ajuda</strong>
        </button>
      </aside>

      {type && <div className="global-feedback-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeDialog(); }}>
        <section className="global-feedback-dialog" role="dialog" aria-modal="true" aria-labelledby="global-feedback-title">
          <header><div><small>CENTRAL DE FEEDBACK</small><h2 id="global-feedback-title">{title}</h2><p>Seu nome e esta página serão identificados automaticamente.</p></div><button type="button" onClick={closeDialog} aria-label="Fechar">×</button></header>
          {message ? <div className="global-feedback-success"><span>✓</span><strong>Mensagem enviada</strong><p>{message}</p><button type="button" onClick={closeDialog}>Concluir</button></div> : <form onSubmit={submit}>
            <label>Categoria<select name="categoria" required defaultValue={categories[0][0]} key={type}>{categories.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
            <label>Descreva com detalhes<textarea name="mensagem" required minLength={10} maxLength={3000} rows={5} placeholder={type === "DENUNCIA" ? "Explique o que há de inadequado nesta publicação" : "Conte o que aconteceu e o que você esperava"} /></label>
            <div className="global-feedback-image-field">
              <span>Foto {type === "PROBLEMA" ? "(obrigatória)" : "(opcional)"}</span>
              <input ref={inputRef} type="file" accept="image/*" onChange={(event) => { void selectImage(event.target.files?.[0]); event.target.value = ""; }} />
              <button type="button" onClick={() => inputRef.current?.click()}>{image ? "Trocar foto" : "Adicionar foto"}</button>
              {imagePreview && <figure><img src={imagePreview} alt="Prévia da foto anexada" /><button type="button" onClick={() => { setImage(null); setImagePreview(""); }}>Remover</button></figure>}
              <small>JPG, PNG ou WebP. A imagem é otimizada antes do envio.</small>
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
