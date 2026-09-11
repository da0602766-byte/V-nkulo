"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type Assignment = {
  id: number;
  escala_id: number;
  usuario_id: number;
  nome: string;
  funcao: string;
};

type ChecklistItem = {
  id: number;
  escala_id: number;
  designacao_id: number | null;
  tarefa: string;
  status: "PENDENTE" | "FEITO" | "NAO_FEITO" | "SUBSTITUIDO";
  substituto_usuario_id: number | null;
  substituto_externo_nome: string;
  substituto_nome: string | null;
  responsavel_nome: string | null;
  observacao: string;
};

type Report = {
  id: number;
  resumo: string;
  destinatarios_notificados: number;
  encerrado_em: string;
};

type Schedule = {
  id: number;
  ministerio_nome: string;
  ministerio_categoria: string;
  ministerio_lider_nome: string | null;
  titulo: string;
  inicia_em: string;
  termina_em: string;
  local: string;
  status:
    | "RASCUNHO"
    | "PUBLICADA"
    | "AGUARDANDO_CHECKLIST"
    | "ENCERRADA"
    | "CANCELADA";
  observacoes: string;
  can_manage: number;
  can_delete_checklist: number;
  assignments: Assignment[];
  checklist: ChecklistItem[];
  report: Report | null;
};

export default function DiaconiaWorkspace({
  communityName,
}: {
  communityName: string;
}) {
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [tab, setTab] = useState<"visao" | "checklist" | "historico">("visao");
  const [category, setCategory] = useState("TODAS");
  const [canManage, setCanManage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/pilot/diaconia", {
        cache: "no-store",
      });
      const payload = (await response.json()) as {
        schedules?: Schedule[];
        canManage?: boolean;
        error?: string;
      };
      if (!response.ok) {
        throw new Error(payload.error || "Não foi possível carregar a Diaconia.");
      }
      setSchedules(payload.schedules || []);
      setCanManage(Boolean(payload.canManage));
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadData(), 0);
    return () => window.clearTimeout(timer);
  }, [loadData]);

  const metrics = useMemo(
    () => ({
      abertas: schedules.filter((item) =>
        ["RASCUNHO", "PUBLICADA"].includes(item.status),
      ).length,
      checklists: schedules.filter(
        (item) => item.status === "AGUARDANDO_CHECKLIST",
      ).length,
      encerradas: schedules.filter((item) => item.status === "ENCERRADA").length,
      pendencias: schedules.reduce(
        (total, schedule) =>
          total +
          schedule.checklist.filter((item) => item.status === "PENDENTE").length,
        0,
      ),
    }),
    [schedules],
  );

  const categories = useMemo(
    () => [
      "TODAS",
      ...Array.from(
        new Set(
          schedules.map(
            (schedule) => schedule.ministerio_categoria || "OUTRO",
          ),
        ),
      ),
    ],
    [schedules],
  );
  const visibleSchedules = schedules.filter((schedule) => {
    const matchesCategory =
      category === "TODAS" ||
      (schedule.ministerio_categoria || "OUTRO") === category;
    const matchesTab =
      tab === "historico"
        ? ["ENCERRADA", "CANCELADA"].includes(schedule.status)
        : tab === "checklist"
          ? schedule.status === "AGUARDANDO_CHECKLIST"
          : !["ENCERRADA", "CANCELADA"].includes(schedule.status);
    return matchesCategory && matchesTab;
  });

  async function mutate(
    key: string,
    body: Record<string, unknown>,
    success: string,
  ) {
    setBusy(key);
    setFeedback("");
    setError("");
    try {
      const response = await fetch("/api/pilot/diaconia", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error || "Não foi possível concluir a ação.");
      }
      setFeedback(success);
      await loadData();
      return true;
    } catch (caught) {
      setError((caught as Error).message);
      return false;
    } finally {
      setBusy("");
    }
  }

  async function deleteChecklistItem(item: ChecklistItem) {
    if (
      !window.confirm(
        `Excluir definitivamente o checklist “${item.tarefa}”? Esta ação será auditada.`,
      )
    ) {
      return;
    }
    await mutate(
      `delete-item-${item.id}`,
      { acao: "EXCLUIR_ITEM", itemId: item.id },
      "Checklist excluído com registro na auditoria.",
    );
  }

  return (
    <section className="diaconia-workspace">
      <header className="workspace-heading diaconia-heading">
        <div>
          <p className="pilot-kicker">CENTRAL DE SERVIÇO · DIACONIA</p>
          <h1>Checklists e relatórios</h1>
          <p>
            Todas as escalas de {communityName} chegam aqui, organizadas por
            categoria. Cada pessoa vê somente o que sua função permite.
          </p>
        </div>
        <span className="scope-badge">Escopo validado no servidor</span>
      </header>

      <div className="operations-notice">
        <strong>Fluxo automático e auditado</strong>
        <span>
          O modelo gera o checklist, a escala aparece por categoria e, após o
          horário, libera a conferência no próximo acesso. Proprietário e
          pastores acompanham tudo nas próprias comunidades.
        </span>
      </div>

      <ol className="diaconia-flow" aria-label="Etapas do checklist">
        {[
          ["01", "Escala criada", "Modelo e responsáveis"],
          ["02", "Serviço realizado", "Aguardando o horário final"],
          ["03", "Checklist liberado", "Feito, não feito ou substituído"],
          ["04", "Relatório enviado", "Gestores notificados"],
        ].map(([number, title, description]) => (
          <li key={number}>
            <span>{number}</span>
            <div>
              <strong>{title}</strong>
              <small>{description}</small>
            </div>
          </li>
        ))}
      </ol>

      <div className="diaconia-metrics">
        <Metric label="Escalas abertas" value={metrics.abertas} tone="blue" />
        <Metric
          label="Aguardando checklist"
          value={metrics.checklists}
          tone="amber"
        />
        <Metric label="Encerradas" value={metrics.encerradas} tone="green" />
        <Metric label="Itens pendentes" value={metrics.pendencias} tone="purple" />
      </div>

      <div className="ministry-tabs" role="tablist" aria-label="Diaconia">
        <button
          role="tab"
          aria-selected={tab === "visao"}
          className={tab === "visao" ? "active" : ""}
          onClick={() => setTab("visao")}
        >
          Visão geral <span>{metrics.abertas}</span>
        </button>
        <button
          role="tab"
          aria-selected={tab === "checklist"}
          className={tab === "checklist" ? "active" : ""}
          onClick={() => setTab("checklist")}
        >
          Checklists <span>{metrics.checklists}</span>
        </button>
        <button
          role="tab"
          aria-selected={tab === "historico"}
          className={tab === "historico" ? "active" : ""}
          onClick={() => setTab("historico")}
        >
          Histórico <span>{metrics.encerradas}</span>
        </button>
      </div>

      <div
        className="diaconia-category-filter"
        aria-label="Filtrar por categoria"
      >
        {categories.map((item) => (
          <button
            type="button"
            key={item}
            className={category === item ? "active" : ""}
            onClick={() => setCategory(item)}
          >
            {item === "TODAS" ? "Todas" : categoryLabel(item)}
          </button>
        ))}
      </div>

      {feedback && (
        <p className="operations-feedback" role="status">
          {feedback}
        </p>
      )}
      {error && (
        <div className="operations-feedback error" role="alert">
          <span>{error}</span>
          <button onClick={() => void loadData()}>Tentar novamente</button>
        </div>
      )}

      {loading ? (
        <div className="diaconia-loading" aria-label="Carregando Diaconia">
          <span />
          <span />
          <span />
        </div>
      ) : visibleSchedules.length ? (
        <div className="diaconia-schedule-list">
          {visibleSchedules.map((schedule) => (
            <article className="diaconia-schedule-card" key={schedule.id}>
              <header>
                <div>
                  <span className={`diaconia-status ${schedule.status.toLowerCase()}`}>
                    {scheduleStatus(schedule.status)}
                  </span>
                  <small>
                    {categoryLabel(schedule.ministerio_categoria)} ·{" "}
                    {schedule.ministerio_nome}
                  </small>
                </div>
                <time>{formatDate(schedule.inicia_em)}</time>
              </header>
              <div className="diaconia-schedule-summary">
                <div>
                  <h2>{schedule.titulo}</h2>
                  <p>{schedule.observacoes || "Sem observações adicionais."}</p>
                </div>
                <dl>
                  <div>
                    <dt>Horário</dt>
                    <dd>{formatRange(schedule.inicia_em, schedule.termina_em)}</dd>
                  </div>
                  <div>
                    <dt>Local</dt>
                    <dd>{schedule.local || "A definir"}</dd>
                  </div>
                  <div>
                    <dt>Líder do ministério</dt>
                    <dd>{schedule.ministerio_lider_nome || "Não definido"}</dd>
                  </div>
                </dl>
              </div>

              <div className="diaconia-team-row">
                <strong>Equipe escalada</strong>
                <div>
                  {schedule.assignments.length ? (
                    schedule.assignments.map((assignment) => (
                      <span key={assignment.id} title={assignment.funcao}>
                        {initials(assignment.nome)}
                        <small>{assignment.nome}</small>
                      </span>
                    ))
                  ) : (
                    <em>Nenhuma pessoa designada.</em>
                  )}
                </div>
              </div>

              <div className="diaconia-checklist">
                <div className="diaconia-section-title">
                  <strong>
                    Relatório do checklist · {schedule.ministerio_nome}
                  </strong>
                  <span>Somente leitura · {schedule.checklist.length} itens</span>
                </div>
                {schedule.checklist.length ? (
                  schedule.checklist.map((item) => (
                    <ChecklistRow
                      key={item.id}
                      item={item}
                      canDelete={Boolean(schedule.can_delete_checklist)}
                      busy={busy === `delete-item-${item.id}`}
                      onDelete={deleteChecklistItem}
                    />
                  ))
                ) : (
                  <p className="diaconia-empty-inline">
                    O responsável ainda não adicionou tarefas.
                  </p>
                )}
              </div>

              <p className="diaconia-readonly-note">
                A conferência e a edição deste checklist acontecem dentro do
                respectivo Ministério. A Diaconia exibe o relatório consolidado
                sem permitir alterações acidentais.
              </p>

              {schedule.report && (
                <div className="diaconia-report-ready">
                  <div>
                    <strong>Relatório concluído</strong>
                    <span>
                      {schedule.report.destinatarios_notificados} responsáveis
                      notificados na plataforma.
                    </span>
                  </div>
                  <a
                    href={`/api/pilot/diaconia/${schedule.id}/pdf?download=1`}
                  >
                    Baixar PDF
                  </a>
                </div>
              )}
            </article>
          ))}
        </div>
      ) : (
        <div className="pilot-empty-state">
          <strong>Nenhuma escala nesta etapa</strong>
          <p>
            {canManage
              ? "Crie uma escala a partir de um modelo na área de Ministérios."
              : "Somente escalas em que você participa aparecem aqui."}
          </p>
        </div>
      )}
    </section>
  );
}

function ChecklistRow({
  item,
  canDelete,
  busy,
  onDelete,
}: {
  item: ChecklistItem;
  canDelete: boolean;
  busy: boolean;
  onDelete: (item: ChecklistItem) => Promise<void>;
}) {
  return (
    <article
      className={`diaconia-check-item status-${item.status.toLowerCase()}`}
    >
      <div className="diaconia-task-copy">
        <span aria-hidden="true">{statusIcon(item.status)}</span>
        <div>
          <strong>{item.tarefa}</strong>
          <small>{item.responsavel_nome || "Equipe geral"}</small>
        </div>
      </div>
      <span className="diaconia-readonly-status">
        {checklistStatus(item.status)}
      </span>
      {item.observacao && (
        <small className="diaconia-observation-copy">{item.observacao}</small>
      )}
      {item.status === "SUBSTITUIDO" && (
        <small className="diaconia-substitute-note">
          Substituto:{" "}
          {item.substituto_nome ||
            item.substituto_externo_nome ||
            "não informado"}
        </small>
      )}
      {canDelete && (
        <button
          type="button"
          className="danger-button"
          disabled={busy}
          onClick={() => void onDelete(item)}
        >
          {busy ? "Excluindo…" : "Excluir checklist"}
        </button>
      )}
    </article>
  );
}

function Metric({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: string;
}) {
  return (
    <article className={`diaconia-metric ${tone}`}>
      <span aria-hidden="true">◇</span>
      <div>
        <strong>{value}</strong>
        <small>{label}</small>
      </div>
    </article>
  );
}

function scheduleStatus(status: Schedule["status"]) {
  return (
    {
      RASCUNHO: "Rascunho",
      PUBLICADA: "Publicada",
      AGUARDANDO_CHECKLIST: "Aguardando checklist",
      ENCERRADA: "Encerrada",
      CANCELADA: "Cancelada",
    }[status] || status
  );
}

function statusIcon(status: ChecklistItem["status"]) {
  return (
    {
      PENDENTE: "○",
      FEITO: "✓",
      NAO_FEITO: "!",
      SUBSTITUIDO: "↻",
    }[status] || "○"
  );
}

function checklistStatus(status: ChecklistItem["status"]) {
  return (
    {
      PENDENTE: "Pendente",
      FEITO: "Concluído",
      NAO_FEITO: "Não realizado",
      SUBSTITUIDO: "Substituído",
    }[status] || status
  );
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("pt-BR", {
    weekday: "short",
    day: "2-digit",
    month: "short",
  });
}

function formatRange(start: string, end: string) {
  const formatter = new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });
  return `${formatter.format(new Date(start))}–${formatter.format(new Date(end))}`;
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function categoryLabel(value: string) {
  return (
    {
      LOUVOR: "Louvor",
      RECEPCAO: "Recepção",
      CRIANCAS: "Crianças",
      MIDIA: "Mídia",
      ACAO_SOCIAL: "Ação social",
      INTERCESSAO: "Intercessão",
      DIACONIA: "Diaconia",
      ESTACIONAMENTO: "Estacionamento",
      OUTRO: "Outros",
    }[value] || String(value || "Outros").replaceAll("_", " ")
  );
}
