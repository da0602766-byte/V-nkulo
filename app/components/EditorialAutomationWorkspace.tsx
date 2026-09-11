"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import NativeImageUpload from "./NativeImageUpload";

type Community = { id: number; nome: string };
type Draft = {
  id: number;
  comunidade_id: number;
  comunidade_nome: string;
  titulo: string;
  conteudo: string;
  categoria: string;
  referencia: string;
  origem: string;
  status: string;
  politica_aplicada: string;
  versao: number;
  motivo_bloqueio: string;
  conteudo_semelhante_id: number | null;
  revisado_em: string | null;
  revisor_nome: string | null;
  criado_em: string;
};
type EditorialData = {
  config: {
    mode: string;
    enabled: boolean;
    categories: string[];
    blockedTopics: string[];
    frequency: string;
    schedules: string[];
    communityIds: number[];
    dailyQuantity: number;
    maxLength: number;
    useImages: boolean;
    sources: string[];
  };
  communities: Community[];
  drafts: Draft[];
  allowedCategories: string[];
  blockedTopics: string[];
  provider: {
    connected: boolean;
    generationAvailable: boolean;
    dependency: string;
  };
};
type ScheduledPublication = {
  id: number;
  comunidade_id: number;
  comunidade_nome: string;
  titulo: string;
  mensagem: string;
  categoria: string;
  referencia: string;
  imagem_url: string;
  imagem_alt: string;
  visibilidade: string;
  comentarios_habilitados: number;
  status: string;
  publicar_em: string;
  autorizado_em: string | null;
  cancelado_em: string | null;
  publicacao_id: number | null;
  criado_em: string;
};
type ScheduleData = {
  queue: ScheduledPublication[];
  safeguards: {
    humanAuthorizationRequired: boolean;
    cancellableUntilDispatch: boolean;
    aiGenerationConnected: boolean;
  };
};

const LABELS: Record<string, string> = {
  VERSICULOS_COM_REFERENCIA: "Versículos com referência",
  DICAS_DA_PLATAFORMA: "Dicas da plataforma",
  TUTORIAIS: "Tutoriais",
  CURIOSIDADES: "Curiosidades",
  SEGURANCA: "Segurança",
  BOAS_PRATICAS: "Boas práticas",
  NOVIDADES_OFICIAIS: "Novidades oficiais",
  ACONSELHAMENTO_PESSOAL: "Aconselhamento pessoal",
  DADOS_PRIVADOS: "Dados privados",
  ACUSACOES: "Acusações",
  POLITICA_DIRECIONADA: "Política direcionada",
  DIAGNOSTICO: "Diagnóstico",
  CONTEUDO_DISCRIMINATORIO: "Conteúdo discriminatório",
  DOUTRINA_CONTROVERSA: "Doutrina controversa",
  PROPAGANDA_NAO_AUTORIZADA: "Propaganda não autorizada",
};

export default function EditorialAutomationWorkspace() {
  const [data, setData] = useState<EditorialData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [reviewReasons, setReviewReasons] = useState<Record<number, string>>({});
  const [publishPasswords, setPublishPasswords] = useState<Record<number, string>>({});
  const [scheduleData, setScheduleData] = useState<ScheduleData | null>(null);
  const [scheduleImage, setScheduleImage] = useState("");
  const [schedulePasswords, setSchedulePasswords] = useState<Record<number, string>>({});
  const [scheduleWorking, setScheduleWorking] = useState(false);
  const [now, setNow] = useState(0);

  const readResult = useCallback(async (response: Response) => {
    const text = await response.text();
    if (!text) return {} as Record<string, unknown>;
    try { return JSON.parse(text) as Record<string, unknown>; }
    catch { return { error: "O servidor retornou uma resposta inválida." }; }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    const [response, scheduleResponse] = await Promise.all([
      fetch("/api/pilot/editorial", { cache: "no-store" }),
      fetch("/api/pilot/editorial/programacoes", { cache: "no-store" }),
    ]);
    const result = (await readResult(response)) as unknown as EditorialData & { error?: string };
    const scheduleResult = (await readResult(scheduleResponse)) as unknown as ScheduleData & { error?: string };
    if (!response.ok || !scheduleResponse.ok) {
      setMessage(
        result.error || scheduleResult.error || "Não foi possível carregar o módulo.",
      );
      setLoading(false);
      return;
    }
    setData(result);
    setScheduleData(scheduleResult);
    setLoading(false);
  }, [readResult]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  useEffect(() => {
    const firstTick = window.setTimeout(() => setNow(Date.now()), 0);
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => {
      window.clearTimeout(firstTick);
      window.clearInterval(timer);
    };
  }, []);

  function toggleCategory(category: string) {
    if (!data) return;
    setData({
      ...data,
      config: {
        ...data.config,
        categories: data.config.categories.includes(category)
          ? data.config.categories.filter((item) => item !== category)
          : [...data.config.categories, category],
      },
    });
  }

  function toggleCommunity(id: number) {
    if (!data) return;
    setData({
      ...data,
      config: {
        ...data.config,
        communityIds: data.config.communityIds.includes(id)
          ? data.config.communityIds.filter((item) => item !== id)
          : [...data.config.communityIds, id],
      },
    });
  }

  async function saveConfig(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!data) return;
    setSaving(true);
    setMessage("");
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/pilot/editorial", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...data.config,
        mode: data.config.enabled ? data.config.mode : "PAUSADO",
        password: form.get("password"),
      }),
    });
    const result = (await readResult(response)) as { error?: string; mode?: string };
    setSaving(false);
    if (!response.ok) {
      setMessage(result.error || "Não foi possível salvar.");
      return;
    }
    event.currentTarget.reset();
    setMessage(
      result.mode === "PAUSADO"
        ? "Automação pausada. Nenhuma nova geração poderá ser solicitada."
        : `Política salva no modo ${modeLabel(result.mode || data.config.mode)}.`,
    );
    await load();
  }

  async function review(draftId: number, action: string) {
    setMessage("");
    const response = await fetch("/api/pilot/editorial", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        draftId,
        action,
        reason: reviewReasons[draftId] || "",
        password: publishPasswords[draftId] || "",
      }),
    });
    const result = (await readResult(response)) as {
      error?: string;
      message?: string;
    };
    if (!response.ok) {
      setMessage(result.error || "Não foi possível registrar a decisão.");
      return;
    }
    setMessage(result.message || "Decisão registrada.");
    await load();
  }

  async function createSchedule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setScheduleWorking(true);
    setMessage("");
    const response = await fetch("/api/pilot/editorial/programacoes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        comunidadeId: Number(form.get("comunidadeId")),
        titulo: form.get("titulo"),
        mensagem: form.get("mensagem"),
        categoria: form.get("categoria"),
        referencia: form.get("referencia"),
        publicarEm: form.get("publicarEm"),
        visibilidade: form.get("visibilidade"),
        comentariosHabilitados: form.get("comentariosHabilitados") === "on",
        imagemUrl: scheduleImage,
        imagemAlt: form.get("imagemAlt"),
        password: form.get("password"),
        authorizeNow: true,
      }),
    });
    const result = (await readResult(response)) as { error?: string; message?: string };
    setScheduleWorking(false);
    if (!response.ok) {
      setMessage(result.error || "Não foi possível salvar a programação.");
      return;
    }
    formElement.reset();
    setScheduleImage("");
    setMessage(result.message || "Publicação autorizada e adicionada à fila.");
    await load();
  }

  async function scheduleAction(id: number, action: "AUTORIZAR" | "CANCELAR") {
    setScheduleWorking(true);
    setMessage("");
    const response = await fetch("/api/pilot/editorial/programacoes", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id,
        action,
        password: schedulePasswords[id] || "",
      }),
    });
    const result = (await readResult(response)) as { error?: string; message?: string };
    setScheduleWorking(false);
    if (!response.ok) {
      setMessage(result.error || "Não foi possível atualizar a programação.");
      return;
    }
    setSchedulePasswords((current) => ({ ...current, [id]: "" }));
    setMessage(result.message || "Programação atualizada.");
    await load();
  }

  if (loading) {
    return (
      <section className="editorial-shell editorial-loading" aria-busy="true">
        <span />
        <div>
          <strong>Carregando governança editorial</strong>
          <p>Consultando política e fila de revisão.</p>
        </div>
      </section>
    );
  }
  if (!data) {
    return <p className="pilot-form-message">{message}</p>;
  }

  const pending = data.drafts.filter(
    (draft) => draft.status === "AGUARDANDO_REVISAO",
  ).length;

  return (
    <section className="editorial-shell">
      <header className="editorial-hero">
        <div>
          <p className="pilot-kicker">AUTOMAÇÃO EDITORIAL V4.5</p>
          <h1>Governança e automação editorial</h1>
          <p>
            Escolha o modo, prepare conteúdos seguros e acompanhe cada envio
            programado.
          </p>
        </div>
        <div className="editorial-status-card">
          <span className={data.config.enabled ? "is-on" : "is-paused"} />
          <div>
            <small>Modo atual</small>
            <strong>
              {data.config.enabled ? modeLabel(data.config.mode).toUpperCase() : "PAUSADO"}
            </strong>
          </div>
          <em>{pending} aguardando</em>
        </div>
      </header>

      <div className="editorial-safety-row">
        <article>
          <span>✓</span>
          <div>
            <strong>Política por modo</strong>
            <p>Revisão individual no modo Com revisão; autorização de série nos demais.</p>
          </div>
        </article>
        <article>
          <span>×</span>
          <div>
            <strong>Proteções obrigatórias</strong>
            <p>Conteúdos sensíveis continuam bloqueados em todos os modos.</p>
          </div>
        </article>
        <article>
          <span>↗</span>
          <div>
            <strong>Backend externo necessário</strong>
            <p>{data.provider.dependency}</p>
          </div>
        </article>
      </div>

      <form className="editorial-config" onSubmit={saveConfig}>
        <div className="editorial-section-heading">
          <div>
            <p className="pilot-kicker">POLÍTICA GLOBAL</p>
            <h2>Regras de geração</h2>
          </div>
          <label className="editorial-switch">
            <input
              type="checkbox"
              checked={data.config.enabled}
              onChange={(event) =>
                setData({
                  ...data,
                  config: { ...data.config, enabled: event.target.checked },
                })
              }
            />
            <span />
            {data.config.enabled ? "Ativa" : "Pausada"}
          </label>
        </div>

        <div className="editorial-mode-grid">
          <button type="button" className={data.config.mode === "COM_REVISAO" ? "selected" : ""} onClick={() => setData({ ...data, config: { ...data.config, mode: "COM_REVISAO" } })}>
            <span>01</span>
            <strong>Com revisão</strong>
            <small>Gera rascunho e aguarda uma pessoa aprovar.</small>
          </button>
          <button type="button" className={data.config.mode === "AUTOMATICO" ? "selected" : ""} onClick={() => setData({ ...data, config: { ...data.config, mode: "AUTOMATICO" } })}>
            <span>02</span>
            <strong>Automático</strong>
            <small>Publica conteúdos preparados e autorizados no horário definido.</small>
          </button>
          <button type="button" className={data.config.mode === "HIBRIDO" ? "selected" : ""} onClick={() => setData({ ...data, config: { ...data.config, mode: "HIBRIDO" } })}>
            <span>03</span>
            <strong>Híbrido</strong>
            <small>Automatiza categorias de baixo risco e envia as demais para revisão.</small>
          </button>
        </div>

        <div className="editorial-fields">
          <label>
            Frequência
            <select
              value={data.config.frequency}
              onChange={(event) =>
                setData({
                  ...data,
                  config: {
                    ...data.config,
                    frequency: event.target.value,
                  },
                })
              }
            >
              <option value="DIARIA">Diária</option>
              <option value="SEMANAL">Semanal</option>
              <option value="MENSAL">Mensal</option>
            </select>
          </label>
          <label>
            Horários
            <input
              value={data.config.schedules.join(", ")}
              placeholder="09:00, 18:00"
              onChange={(event) =>
                setData({
                  ...data,
                  config: {
                    ...data.config,
                    schedules: event.target.value
                      .split(",")
                      .map((item) => item.trim()),
                  },
                })
              }
            />
          </label>
          <label>
            Limite diário
            <input
              type="number"
              min="1"
              max="10"
              value={data.config.dailyQuantity}
              onChange={(event) =>
                setData({
                  ...data,
                  config: {
                    ...data.config,
                    dailyQuantity: Number(event.target.value),
                  },
                })
              }
            />
          </label>
          <label>
            Tamanho máximo
            <input
              type="number"
              min="280"
              max="5000"
              value={data.config.maxLength}
              onChange={(event) =>
                setData({
                  ...data,
                  config: {
                    ...data.config,
                    maxLength: Number(event.target.value),
                  },
                })
              }
            />
          </label>
        </div>

        <div className="editorial-choice-panel">
          <div>
            <h3>Categorias permitidas</h3>
            <p>Ao menos uma categoria deve permanecer ativa.</p>
          </div>
          <div className="editorial-chip-grid">
            {data.allowedCategories.map((category) => (
              <label
                key={category}
                className={
                  data.config.categories.includes(category) ? "selected" : ""
                }
              >
                <input
                  type="checkbox"
                  checked={data.config.categories.includes(category)}
                  onChange={() => toggleCategory(category)}
                />
                {LABELS[category] || category}
              </label>
            ))}
          </div>
        </div>

        <div className="editorial-choice-panel">
          <div>
            <h3>Comunidades de destino</h3>
            <p>Defina onde os futuros rascunhos poderão ser preparados.</p>
          </div>
          <div className="editorial-chip-grid">
            {data.communities.map((community) => (
              <label
                key={community.id}
                className={
                  data.config.communityIds.includes(community.id)
                    ? "selected"
                    : ""
                }
              >
                <input
                  type="checkbox"
                  checked={data.config.communityIds.includes(community.id)}
                  onChange={() => toggleCommunity(community.id)}
                />
                {community.nome}
              </label>
            ))}
          </div>
        </div>

        <div className="editorial-policy-columns">
          <label>
            Fontes permitidas
            <textarea
              rows={5}
              value={data.config.sources.join("\n")}
              onChange={(event) =>
                setData({
                  ...data,
                  config: {
                    ...data.config,
                    sources: event.target.value.split("\n"),
                  },
                })
              }
              placeholder="Uma fonte oficial por linha"
            />
          </label>
          <div>
            <strong>Temas sempre proibidos</strong>
            <ul>
              {data.blockedTopics.map((topic) => (
                <li key={topic}>× {LABELS[topic] || topic}</li>
              ))}
            </ul>
          </div>
        </div>

        <label className="editorial-image-option">
          <input
            type="checkbox"
            checked={data.config.useImages}
            onChange={(event) =>
              setData({
                ...data,
                config: {
                  ...data.config,
                  useImages: event.target.checked,
                },
              })
            }
          />
          <span>
            <strong>Preparar uso de imagens</strong>
            <small>
              A opção será registrada, mas a geração de imagem continua
              indisponível até existir um serviço externo aprovado.
            </small>
          </span>
        </label>

        <div className="editorial-save-row">
          <label>
            Confirme sua senha
            <input
              type="password"
              name="password"
              required
              autoComplete="current-password"
            />
          </label>
          <button disabled={saving}>
            {saving ? "Salvando…" : "Salvar política"}
          </button>
        </div>
      </form>

      <section className="editorial-schedule">
        <div className="editorial-section-heading">
          <div>
            <p className="pilot-kicker">PROGRAMAÇÃO AUTORIZADA</p>
            <h2>Mensagens prontas e horário de publicação</h2>
            <p>
              Prepare o conteúdo, revise a imagem e autorize com sua senha. O
              contador só começa depois da autorização humana.
            </p>
          </div>
          <span className="editorial-schedule-safeguard">Autorização obrigatória</span>
        </div>

        <div className="editorial-schedule-layout">
          <form className="editorial-schedule-form" onSubmit={createSchedule}>
            <div className="editorial-schedule-form-heading">
              <span>＋</span>
              <div>
                <strong>Preparar publicação</strong>
                <small>Salva como rascunho até você autorizar.</small>
              </div>
            </div>
            <div className="editorial-schedule-fields">
              <label>
                Comunidade
                <select name="comunidadeId" required defaultValue="">
                  <option value="" disabled>Selecione a comunidade</option>
                  {data.communities.map((community) => (
                    <option key={community.id} value={community.id}>{community.nome}</option>
                  ))}
                </select>
              </label>
              <label>
                Categoria
                <select name="categoria" required defaultValue="">
                  <option value="" disabled>Selecione a categoria</option>
                  {data.allowedCategories.map((category) => (
                    <option key={category} value={category}>{LABELS[category] || category}</option>
                  ))}
                </select>
              </label>
              <label className="composer-wide">
                Título
                <input name="titulo" minLength={4} maxLength={140} required />
              </label>
              <label className="composer-wide">
                Mensagem pronta
                <textarea name="mensagem" minLength={20} maxLength={5000} rows={6} required />
              </label>
              <label>
                Fonte ou referência
                <input name="referencia" maxLength={260} placeholder="Obrigatória para versículos" />
              </label>
              <label>
                Publicar em
                <input
                  name="publicarEm"
                  type="datetime-local"
                  min={toLocalDateTimeInput(new Date(now + 60_000))}
                  required
                />
              </label>
              <label>
                Destino
                <input type="hidden" name="visibilidade" value="COMUNIDADE" />
                <span className="request-privacy-readonly">Somente na comunidade selecionada</span>
              </label>
              <label className="editorial-schedule-checkbox">
                <input name="comentariosHabilitados" type="checkbox" defaultChecked />
                Permitir comentários
              </label>
            </div>
            <NativeImageUpload
              label="Imagem da publicação (opcional)"
              purpose="post-image"
              value={scheduleImage}
              onChange={setScheduleImage}
            />
            <label>
              Descrição acessível da imagem
              <input name="imagemAlt" maxLength={180} placeholder="Descreva o conteúdo visual" />
            </label>
            <label className="editorial-schedule-password">
              Confirme sua senha para autorizar
              <input
                name="password"
                type="password"
                autoComplete="current-password"
                required
                placeholder="Senha da sua conta"
              />
              <small>A publicação entra na fila autorizada e poderá ser cancelada antes do envio.</small>
            </label>
            <button disabled={scheduleWorking}>
              {scheduleWorking ? "Autorizando…" : "Salvar, autorizar e agendar"}
            </button>
            {message && (
              <p className="editorial-schedule-feedback" role="status">{message}</p>
            )}
          </form>

          <div className="editorial-schedule-queue">
            <header>
              <div>
                <strong>Fila programada</strong>
                <small>{scheduleData?.queue.length || 0} itens registrados</small>
              </div>
              <span>◷</span>
            </header>
            {!scheduleData?.queue.length && (
              <div className="editorial-schedule-empty">
                <span>◷</span>
                <strong>Nenhuma mensagem programada</strong>
                <p>Crie o primeiro rascunho e autorize somente depois da revisão.</p>
              </div>
            )}
            <div className="editorial-schedule-list">
              {scheduleData?.queue.map((item) => (
                <article key={item.id} className={`status-${item.status.toLowerCase()}`}>
                  {item.imagem_url && (
                    <img src={item.imagem_url} alt={item.imagem_alt || ""} loading="lazy" />
                  )}
                  <div className="editorial-schedule-card-head">
                    <span>{scheduleStatusLabel(item.status)}</span>
                    <time>{formatDate(item.publicar_em)}</time>
                  </div>
                  <small>{item.comunidade_nome} · {LABELS[item.categoria] || item.categoria}</small>
                  <h3>{item.titulo}</h3>
                  <p>{item.mensagem}</p>
                  {item.status === "AGENDADA" && (
                    <div className="editorial-countdown" aria-live="polite">
                      <small>Próxima publicação em</small>
                      <strong>{formatCountdown(item.publicar_em, now)}</strong>
                    </div>
                  )}
                  {item.status === "RASCUNHO" && (
                    <div className="editorial-schedule-authorize">
                      <label>
                        Confirme sua senha
                        <input
                          type="password"
                          autoComplete="current-password"
                          value={schedulePasswords[item.id] || ""}
                          onChange={(event) => setSchedulePasswords({
                            ...schedulePasswords,
                            [item.id]: event.target.value,
                          })}
                        />
                      </label>
                      <button
                        type="button"
                        disabled={scheduleWorking}
                        onClick={() => void scheduleAction(item.id, "AUTORIZAR")}
                      >
                        Autorizar e iniciar contador
                      </button>
                    </div>
                  )}
                  {["RASCUNHO", "AGENDADA", "FALHA", "BLOQUEADA"].includes(item.status) && (
                    <button
                      type="button"
                      className="editorial-schedule-cancel"
                      disabled={scheduleWorking}
                      onClick={() => void scheduleAction(item.id, "CANCELAR")}
                    >
                      Cancelar publicação
                    </button>
                  )}
                </article>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="editorial-queue">
        <div className="editorial-section-heading">
          <div>
            <p className="pilot-kicker">FILA DE REVISÃO</p>
            <h2>Rascunhos registrados</h2>
          </div>
          <button type="button" disabled title={data.provider.dependency}>
            + Solicitar geração
          </button>
        </div>
        {!data.drafts.length && (
          <div className="editorial-empty">
            <span>◇</span>
            <h3>Nenhum rascunho recebido</h3>
            <p>A fila será preenchida pelo futuro provedor de IA no backend.</p>
          </div>
        )}
        <div className="editorial-draft-list">
          {data.drafts.map((draft) => (
            <article key={draft.id}>
              <header>
                <div>
                  <span className={`editorial-badge status-${draft.status}`}>
                    {draft.status.replaceAll("_", " ")}
                  </span>
                  <span className="editorial-badge">{draft.origem}</span>
                  <span className="editorial-badge">
                    v{draft.versao}
                  </span>
                </div>
                <time>{formatDate(draft.criado_em)}</time>
              </header>
              <p className="editorial-community">
                {draft.comunidade_nome} · {LABELS[draft.categoria] || draft.categoria}
              </p>
              <h3>{draft.titulo}</h3>
              <p>{draft.conteudo}</p>
              {draft.referencia && (
                <small>Fonte/referência: {draft.referencia}</small>
              )}
              {draft.conteudo_semelhante_id && (
                <div className="editorial-similarity">
                  Conteúdo semelhante: #{draft.conteudo_semelhante_id}
                </div>
              )}
              {draft.motivo_bloqueio && (
                <div className="editorial-decision">
                  Motivo: {draft.motivo_bloqueio}
                </div>
              )}
              {draft.status === "AGUARDANDO_REVISAO" && (
                <div className="editorial-review-actions">
                  <input
                    value={reviewReasons[draft.id] || ""}
                    onChange={(event) =>
                      setReviewReasons({
                        ...reviewReasons,
                        [draft.id]: event.target.value,
                      })
                    }
                    placeholder="Motivo obrigatório para rejeitar ou bloquear"
                    aria-label={`Motivo da decisão para ${draft.titulo}`}
                  />
                  <button
                    type="button"
                    className="approve"
                    onClick={() => review(draft.id, "APROVAR")}
                  >
                    Aprovar rascunho
                  </button>
                  <button
                    type="button"
                    onClick={() => review(draft.id, "REJEITAR")}
                  >
                    Rejeitar
                  </button>
                  <button
                    type="button"
                    className="block"
                    onClick={() => review(draft.id, "BLOQUEAR")}
                  >
                    Bloquear
                  </button>
                </div>
              )}
              {draft.status === "APROVADO" && (
                <div className="editorial-manual-publish">
                  <div>
                    <strong>Publicação manual</strong>
                    <small>Confirme sua senha. A automação continua sem permissão para publicar sozinha.</small>
                  </div>
                  <input
                    type="password"
                    autoComplete="current-password"
                    value={publishPasswords[draft.id] || ""}
                    onChange={(event) => setPublishPasswords({ ...publishPasswords, [draft.id]: event.target.value })}
                    placeholder="Sua senha"
                    aria-label={`Senha para publicar ${draft.titulo}`}
                  />
                  <button type="button" className="approve" onClick={() => void review(draft.id, "PUBLICAR")}>Publicar agora</button>
                </div>
              )}
              {draft.revisado_em && (
                <footer>
                  Revisado por {draft.revisor_nome || "Superadministrador"} em{" "}
                  {formatDate(draft.revisado_em)}
                </footer>
              )}
            </article>
          ))}
        </div>
      </section>
      {message && (
        <p className="pilot-form-message" role="status">
          {message}
        </p>
      )}
    </section>
  );
}

function formatDate(value: string) {
  const date = new Date(value.includes("T") ? value : `${value.replace(" ", "T")}Z`);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("pt-BR", {
        dateStyle: "short",
        timeStyle: "short",
      }).format(date);
}

function toLocalDateTimeInput(date: Date) {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function scheduleStatusLabel(status: string) {
  return ({
    RASCUNHO: "Aguardando autorização",
    AGENDADA: "Autorizada",
    PROCESSANDO: "Publicando",
    PUBLICADA: "Publicada",
    CANCELADA: "Cancelada",
    BLOQUEADA: "Bloqueada pela política",
    FALHA: "Falha no envio",
  } as Record<string, string>)[status] || status;
}

function modeLabel(mode: string) {
  return ({
    COM_REVISAO: "Com revisão",
    AUTOMATICO: "Automático",
    HIBRIDO: "Híbrido",
    PAUSADO: "Pausado",
  } as Record<string, string>)[mode] || mode;
}

function formatCountdown(value: string, now: number) {
  const date = new Date(value.includes("T") ? value : `${value.replace(" ", "T")}Z`);
  const remaining = Math.max(0, date.getTime() - now);
  const totalSeconds = Math.floor(remaining / 1000);
  const days = Math.floor(totalSeconds / 86_400);
  const hours = Math.floor((totalSeconds % 86_400) / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;
  if (days) return `${days}d ${String(hours).padStart(2, "0")}h ${String(minutes).padStart(2, "0")}min`;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}
