"use client";

import { FormEvent, useMemo, useState } from "react";
import type { DisplayMessageItem } from "./DisplayMessageBanner";

type MaintenanceConfig = {
  ativa?: boolean;
  mensagem?: string;
  iniciaEm?: string | null;
  terminaEm?: string | null;
};

type Props = {
  initialMessages: DisplayMessageItem[];
  initialMaintenance: MaintenanceConfig;
  labels: Record<string, string>;
  onChanged: (messages: DisplayMessageItem[]) => void;
  notify: (message: string) => void;
};

const AREA_KEYS = [
  "login",
  "todas",
  "inicio",
  "avisos",
  "visitantes",
  "acompanhamentos",
  "celulas",
  "relatorios",
  "louvor",
  "diaconia",
  "cultos",
  "teens",
  "modulos",
  "usuarios",
  "personalizar",
  "seguranca",
  "menu",
] as const;

export default function ScheduledMessagesManager({
  initialMessages,
  initialMaintenance,
  labels,
  onChanged,
  notify,
}: Props) {
  const [messages, setMessages] = useState(initialMessages);
  const [maintenance, setMaintenance] = useState(initialMaintenance);
  const [editing, setEditing] = useState<DisplayMessageItem | null>(null);
  const [editorRevision, setEditorRevision] = useState(0);
  const [saving, setSaving] = useState(false);
  const areaLabels = useMemo(
    () => ({
      login: "Página de login",
      todas: "Todas as abas internas",
      inicio: labels.inicio || "Visão geral",
      avisos: labels.avisos || "Menu Principal",
      visitantes: labels.visitantes || "Visitantes",
      acompanhamentos: labels.acompanhamentos || "Acompanhamentos",
      celulas: labels.celulas || "Células",
      relatorios: labels.relatorios || "Relatórios",
      louvor: labels.louvor || "Equipe de Louvor",
      diaconia: labels.diaconia || "Diaconia",
      cultos: labels.cultos || "Rotinas dos Cultos",
      teens: labels.teens || "Teens",
      modulos: labels.modulos || "Outras áreas",
      usuarios: labels.usuarios || "Usuários e permissões",
      personalizar: labels.personalizar || "Personalização total",
      seguranca: labels.seguranca || "Segurança",
      menu: labels.menu || "Menu",
    }),
    [labels],
  );
  const selectedAreas = parseAreas(editing?.areas);

  async function refreshMessages() {
    const result = await requestJson<{ mensagens: DisplayMessageItem[] }>(
      "/api/mensagens?admin=1",
    );
    setMessages(result.mensagens);
    onChanged(result.mensagens);
  }

  async function saveMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const areas = form.getAll("areas").map(String);
    if (!areas.length) {
      notify("Escolha pelo menos um local para exibir a mensagem.");
      return;
    }
    const payload = {
      titulo: form.get("titulo"),
      mensagem: form.get("mensagem"),
      tipo: form.get("tipo"),
      areas,
      animacao: form.get("animacao"),
      intervaloSegundos: Number(form.get("intervaloSegundos") || 7),
      iniciaEm: toIso(form.get("iniciaEm")),
      terminaEm: toIso(form.get("terminaEm")),
      ativo: form.get("ativo") === "on",
    };
    setSaving(true);
    try {
      await requestJson(editing ? `/api/mensagens/${editing.id}` : "/api/mensagens", {
        method: editing ? "PATCH" : "POST",
        body: JSON.stringify(payload),
      });
      await refreshMessages();
      setEditing(null);
      setEditorRevision((value) => value + 1);
      notify(editing ? "Mensagem atualizada." : "Mensagem programada.");
    } catch (error) {
      notify((error as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function removeMessage(message: DisplayMessageItem) {
    if (!window.confirm(`Excluir a mensagem “${message.titulo}”?`)) return;
    try {
      await requestJson(`/api/mensagens/${message.id}`, { method: "DELETE" });
      await refreshMessages();
      if (editing?.id === message.id) {
        setEditing(null);
        setEditorRevision((value) => value + 1);
      }
      notify("Mensagem excluída.");
    } catch (error) {
      notify((error as Error).message);
    }
  }

  async function saveMaintenance(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const next: MaintenanceConfig = {
      ativa: form.get("ativa") === "on",
      mensagem: String(form.get("mensagem") || "").trim(),
      iniciaEm: toIso(form.get("iniciaEm")),
      terminaEm: toIso(form.get("terminaEm")),
    };
    if (!next.mensagem) {
      notify("Digite a mensagem que será mostrada durante a manutenção.");
      return;
    }
    if (
      next.iniciaEm &&
      next.terminaEm &&
      new Date(next.terminaEm).getTime() <= new Date(next.iniciaEm).getTime()
    ) {
      notify("O fim da manutenção deve ser posterior ao início.");
      return;
    }
    setSaving(true);
    try {
      await requestJson("/api/configuracoes", {
        method: "PATCH",
        body: JSON.stringify({ manutencao: next }),
      });
      setMaintenance(next);
      notify(
        next.ativa
          ? "Modo manutenção salvo. Usuários comuns serão bloqueados no período definido."
          : "Modo manutenção desativado.",
      );
    } catch (error) {
      notify((error as Error).message);
    } finally {
      setSaving(false);
    }
  }

  function startNewMessage() {
    setEditing(null);
    setEditorRevision((value) => value + 1);
    window.setTimeout(
      () => document.getElementById("display-message-editor")?.scrollIntoView({ behavior: "smooth", block: "center" }),
      0,
    );
  }

  function startEditing(message: DisplayMessageItem) {
    setEditing(message);
    setEditorRevision((value) => value + 1);
    window.setTimeout(
      () => document.getElementById("display-message-editor")?.scrollIntoView({ behavior: "smooth", block: "center" }),
      0,
    );
  }

  return (
    <section className="display-control-panel" id="display-control-panel">
      <div className="display-control-heading">
        <div>
          <p className="eyebrow">EXIBIÇÃO E ACESSO</p>
          <h2>Mensagens programadas e manutenção</h2>
          <p>Escolha o conteúdo, o período e exatamente onde cada mensagem deve aparecer.</p>
        </div>
        <button type="button" className="primary-button" onClick={startNewMessage}>
          ＋ Programar mensagem
        </button>
      </div>

      <form className={`maintenance-control ${maintenance.ativa ? "active" : ""}`} onSubmit={saveMaintenance}>
        <div className="maintenance-control-title">
          <span aria-hidden="true">◇</span>
          <div>
            <strong>Modo manutenção</strong>
            <p>Quando estiver ativo, somente perfis ADMIN conseguem entrar e usar o sistema.</p>
          </div>
          <label className="switch-field">
            <input type="checkbox" name="ativa" defaultChecked={Boolean(maintenance.ativa)} />
            <span>{maintenance.ativa ? "Ativado" : "Desativado"}</span>
          </label>
        </div>
        <label className="span-2">
          Mensagem para os usuários
          <textarea
            name="mensagem"
            rows={3}
            required
            defaultValue={maintenance.mensagem || "Estamos realizando uma manutenção para melhorar o sistema. Tente novamente em breve."}
          />
        </label>
        <label>
          Início — opcional
          <input type="datetime-local" name="iniciaEm" defaultValue={toLocalInput(maintenance.iniciaEm)} />
        </label>
        <label>
          Fim — opcional
          <input type="datetime-local" name="terminaEm" defaultValue={toLocalInput(maintenance.terminaEm)} />
        </label>
        <div className="maintenance-actions span-2">
          <small>Sem datas, a mudança começa ou termina quando você ativar ou desativar este controle.</small>
          <button className="primary-button" disabled={saving}>Salvar manutenção</button>
        </div>
      </form>

      <div className="scheduled-message-layout">
        <div className="scheduled-message-list">
          <div className="scheduled-message-list-title">
            <strong>Mensagens cadastradas</strong>
            <small>{messages.length} no total</small>
          </div>
          {messages.length ? messages.map((message) => {
            const areas = parseAreas(message.areas);
            return (
              <article key={message.id} className={`scheduled-message-card type-${message.tipo.toLowerCase()}`}>
                <div className="scheduled-message-status">
                  <span className={Number(message.ativo_agora) ? "live" : "paused"}>
                    {Number(message.ativo_agora) ? "Exibindo agora" : message.ativo ? "Fora do período" : "Desativada"}
                  </span>
                  <small>{message.tipo}</small>
                </div>
                <strong>{message.titulo}</strong>
                <p>{message.mensagem}</p>
                <div className="scheduled-message-destinations">
                  {areas.map((area) => <span key={area}>{areaLabels[area as keyof typeof areaLabels] || area}</span>)}
                </div>
                <div className="scheduled-message-actions">
                  <button type="button" onClick={() => startEditing(message)}>Editar</button>
                  <button type="button" className="danger-link" onClick={() => removeMessage(message)}>Excluir</button>
                </div>
              </article>
            );
          }) : <div className="scheduled-message-empty">Nenhuma mensagem programada. O login permanece limpo até você criar uma.</div>}
        </div>

        <form
          className="scheduled-message-editor"
          id="display-message-editor"
          key={`${editing?.id || "new"}-${editorRevision}`}
          onSubmit={saveMessage}
        >
          <div className="scheduled-editor-title">
            <div>
              <p className="eyebrow">{editing ? "EDITANDO" : "NOVA MENSAGEM"}</p>
              <h3>{editing ? editing.titulo : "Defina a exibição"}</h3>
            </div>
            {editing && <button type="button" onClick={startNewMessage}>Cancelar edição</button>}
          </div>
          <label>
            Título
            <input name="titulo" required maxLength={120} defaultValue={editing?.titulo || ""} placeholder="Ex.: Culto especial neste domingo" />
          </label>
          <label>
            Mensagem
            <textarea name="mensagem" required rows={5} maxLength={2000} defaultValue={editing?.mensagem || ""} placeholder="Digite o texto que as pessoas verão." />
          </label>
          <div className="scheduled-editor-grid">
            <label>
              Tipo
              <select name="tipo" defaultValue={editing?.tipo || "INFO"}>
                <option value="INFO">Informação</option>
                <option value="IMPORTANTE">Importante</option>
                <option value="URGENTE">Urgente</option>
              </select>
            </label>
            <label>
              Animação
              <select name="animacao" defaultValue={editing?.animacao || "SUAVE"}>
                <option value="SUAVE">Aparecer suavemente</option>
                <option value="DESLIZAR">Deslizar</option>
                <option value="PULSAR">Pulso discreto</option>
              </select>
            </label>
            <label>
              Trocar após
              <select name="intervaloSegundos" defaultValue={String(editing?.intervalo_segundos || 7)}>
                {[3, 5, 7, 10, 15, 20, 30].map((seconds) => <option key={seconds} value={seconds}>{seconds} segundos</option>)}
              </select>
            </label>
            <label className="switch-field editor-active-switch">
              <input type="checkbox" name="ativo" defaultChecked={editing ? Boolean(editing.ativo) : true} />
              <span>Mensagem ativa</span>
            </label>
          </div>
          <div className="scheduled-editor-grid two-columns">
            <label>
              Começar em — opcional
              <input type="datetime-local" name="iniciaEm" defaultValue={toLocalInput(editing?.inicia_em)} />
            </label>
            <label>
              Encerrar em — opcional
              <input type="datetime-local" name="terminaEm" defaultValue={toLocalInput(editing?.termina_em)} />
            </label>
          </div>
          <fieldset className="destination-fieldset">
            <legend>Onde deve aparecer</legend>
            <p>Marque o login, abas específicas ou “Todas as abas internas”.</p>
            <div className="destination-grid">
              {AREA_KEYS.map((area) => (
                <label key={area} className={area === "login" || area === "todas" ? "featured" : ""}>
                  <input type="checkbox" name="areas" value={area} defaultChecked={selectedAreas.includes(area)} />
                  <span>{areaLabels[area]}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <button className="primary-button scheduled-save-button" disabled={saving}>
            {saving ? "Salvando…" : editing ? "Salvar alterações" : "Programar mensagem"}
          </button>
        </form>
      </div>
    </section>
  );
}

function parseAreas(value?: string) {
  try {
    const parsed = value ? JSON.parse(value) : [];
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function toIso(value: FormDataEntryValue | null) {
  const text = String(value || "").trim();
  if (!text) return null;
  const date = new Date(text);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function toLocalInput(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

async function requestJson<T = Record<string, unknown>>(
  url: string,
  options?: RequestInit,
) {
  const response = await fetch(url, {
    cache: "no-store",
    ...options,
    headers: { "Content-Type": "application/json", ...options?.headers },
  });
  const body = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(body.error || "Não foi possível concluir.");
  return body;
}
