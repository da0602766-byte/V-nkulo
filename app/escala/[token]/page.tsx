import Link from "next/link";
import { notFound } from "next/navigation";
import type { CSSProperties } from "react";
import { getD1 } from "../../../db";
import SharedScheduleAccessGate from "../../components/SharedScheduleAccessGate";
import SharedSchedulePendingState from "../../components/SharedSchedulePendingState";
import { getSecretaryScheduleDetail } from "../../lib/secretary-schedule";
import { groupScheduleResources } from "../../lib/schedule-resources";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function SharedSchedulePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const token = (await params).token;
  if (!/^[a-f0-9]{32}$/i.test(token)) notFound();
  const db = getD1();
  const row = await db
    .prepare(
      `SELECT id, comunidade_id, compartilhado_em FROM escalas_ministerio
       WHERE share_token = ? AND status = 'PUBLICADA'
       LIMIT 1`,
    )
    .bind(token)
    .first<{ id: number; comunidade_id: number; compartilhado_em: string | null }>();
  if (!row) notFound();
  const accessRow = await db
    .prepare(
      `SELECT
         (SELECT valor FROM configuracoes WHERE chave = ? LIMIT 1) AS valor,
         CAST(strftime('%s', 'now') AS INTEGER) * 1000 AS now_ms`,
    )
    .bind(`schedule_share_access:${row.comunidade_id}:${row.id}`)
    .first<{ valor: string | null; now_ms: number }>();
  const now = Number(accessRow?.now_ms || 0);
  const accessWindow = parseAccessWindow(accessRow?.valor || undefined, row.compartilhado_em, now);
  if (now < accessWindow.opensAt) {
    return (
      <SharedSchedulePendingState
        opensAt={new Date(accessWindow.opensAt).toISOString()}
        serverNow={now}
      />
    );
  }
  if (now > accessWindow.closesAt) {
    return <SharedAccessState title="Acesso temporário encerrado" detail="Solicite ao líder um novo link caso ainda precise consultar esta escala." />;
  }
  const schedule = await getSecretaryScheduleDetail(db, Number(row.id));
  if (!schedule) notFound();
  const scheduleResources = groupScheduleResources(
    schedule.repertorio,
    schedule.links_recursos,
  );
  const assignmentGroups = groupAssignmentsByTeam(
    schedule.equipes,
    schedule.designacoes,
  );
  return (
    <SharedScheduleAccessGate
      opensAt={new Date(accessWindow.opensAt).toISOString()}
      closesAt={new Date(accessWindow.closesAt).toISOString()}
    >
      <main className="shared-secretary-page" id="conteudo-escala">
        <header>
          <Link className="shared-secretary-brand" href="/" aria-label="Entrar na plataforma">V+</Link>
          <div>
            <p>VÍNKULO · SECRETARIA MINISTERIAL</p>
            <strong>Escala compartilhada</strong>
          </div>
          <Link className="shared-secretary-home" href="/">Ir para tela inicial</Link>
        </header>
        <section className="shared-secretary-hero">
          <p>{schedule.comunidade_nome}</p>
          <h1>{schedule.titulo}</h1>
          <span>{schedule.ministerio_nome}</span>
          <dl>
            <div><dt>Início</dt><dd>{formatDate(schedule.inicia_em)}</dd></div>
            <div><dt>Término</dt><dd>{formatDate(schedule.termina_em)}</dd></div>
            <div><dt>Local</dt><dd>{schedule.local || "Não informado"}</dd></div>
            <div><dt>Responsável</dt><dd>{schedule.responsavel_nome || "Não definido"}</dd></div>
          </dl>
        </section>
        <div className="shared-secretary-grid">
          <section>
            <p className="pilot-kicker">EQUIPE</p>
            <h2>Equipes e integrantes</h2>
            <div className="shared-secretary-team-groups">
              {assignmentGroups.map((group) => (
                <section
                  className="shared-secretary-team-card"
                  data-has-members={group.assignments.length > 0}
                  key={String(group.team?.equipe_id || "livre")}
                  style={{ "--team-color": String(group.team?.equipe_cor || "#6f46e8") } as CSSProperties}
                >
                  <header>
                    <span className="shared-secretary-team-marker" aria-hidden="true" />
                    <div>
                      <strong>{String(group.team?.equipe_nome || "Sem equipe definida")}</strong>
                      <small>{group.team?.horario_encontro ? `Destino/local · encontro às ${group.team.horario_encontro}` : "Destino/local"}</small>
                      <span>{teamMeetingDetail(group.team, schedule.local)}</span>
                    </div>
                    <b aria-label={`${group.assignments.length} integrante${group.assignments.length === 1 ? "" : "s"}`}>
                      {group.assignments.length}
                    </b>
                  </header>
                  {group.assignments.length ? (
                    <ul>
                      {group.assignments.map((item) => (
                        <li key={String(item.id)}>
                          <strong>{String(item.nome)}</strong>
                          <span>{String(item.funcao)} · {statusLabel(item.status)}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="shared-secretary-team-empty">Nenhum integrante escalado nesta equipe.</p>
                  )}
                </section>
              ))}
              {!assignmentGroups.length && <p>Nenhum integrante informado.</p>}
            </div>
          </section>
          <section>
            <p className="pilot-kicker">REPERTÓRIO</p>
            <h2>Músicas e materiais</h2>
            {scheduleResources.groups.length ? (
              <ol className="shared-secretary-repertoire">
                {scheduleResources.groups.map((group) => (
                  <li key={group.title}>
                    <strong>{group.title}</strong>
                    {group.links.length > 0 && (
                      <div className="shared-secretary-sublinks">
                        {group.links.map((link) => (
                          <a key={link.id} href={link.url} target="_blank" rel="noreferrer">
                            {linkTypeLabel(link.tipo)}
                          </a>
                        ))}
                      </div>
                    )}
                  </li>
                ))}
              </ol>
            ) : <p>Nenhum item informado.</p>}
          </section>
          <section>
            <p className="pilot-kicker">CHECKLIST</p>
            <h2>Responsabilidades</h2>
            <ul>
              {schedule.checklist.map((item) => (
                <li key={String(item.id)}>
                  <strong>{String(item.tarefa)}</strong>
                  <span>{String(item.responsavel_nome || "Equipe")} · {statusLabel(item.status)}</span>
                </li>
              ))}
            </ul>
          </section>
          {scheduleResources.unmatched.length > 0 && <section>
            <p className="pilot-kicker">LINKS</p>
            <h2>Outros materiais</h2>
            <div className="shared-secretary-links">
              {scheduleResources.unmatched.map((item) => (
                <a key={item.id} href={item.url} target="_blank" rel="noreferrer">
                  {item.titulo}<span>{linkTypeLabel(item.tipo)}</span>
                </a>
              ))}
            </div>
          </section>}
        </div>
        <footer>
          <span>Visualização somente leitura · nenhum dado de contato é exibido.</span>
          <Link className="shared-secretary-footer-home" href="/">Ir para tela inicial</Link>
        </footer>
      </main>
    </SharedScheduleAccessGate>
  );
}

function SharedAccessState({ title, detail }: { title: string; detail: string }) {
  return (
    <main className="shared-secretary-page shared-secretary-access-state">
      <section>
        <Link className="shared-secretary-brand" href="/" aria-label="Entrar na plataforma">V+</Link>
        <p>VÍNKULO · ACESSO TEMPORÁRIO</p>
        <h1>{title}</h1>
        <p>{detail}</p>
        <Link className="shared-secretary-home" href="/">Ir para tela inicial</Link>
      </section>
    </main>
  );
}

function parseAccessWindow(raw: string | undefined, sharedAt: string | null, now: number) {
  try {
    const parsed = JSON.parse(raw || "{}") as { abreEm?: string; fechaEm?: string };
    const opensAt = Date.parse(String(parsed.abreEm || ""));
    const closesAt = Date.parse(String(parsed.fechaEm || ""));
    if (Number.isFinite(opensAt) && Number.isFinite(closesAt) && closesAt > opensAt) {
      return { opensAt, closesAt };
    }
  } catch {
    // Links legados recebem uma janela conservadora abaixo.
  }
  const legacyStart = parseSqliteDate(sharedAt) || now;
  return { opensAt: legacyStart, closesAt: legacyStart + 7 * 24 * 60 * 60 * 1000 };
}

function parseSqliteDate(value: string | null) {
  if (!value) return 0;
  const normalized = value.includes("T") ? value : `${value.replace(" ", "T")}Z`;
  const parsed = Date.parse(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(value));
}

function statusLabel(value: unknown) {
  return (
    {
      PENDENTE: "Pendente",
      CONFIRMADA: "Confirmada",
      INDISPONIVEL: "Indisponível",
      FEITO: "Feito",
      NAO_FEITO: "Não feito",
    }[String(value || "")] || String(value || "")
  );
}

function teamMeetingDetail(
  team: { funcao: string; ponto_encontro: string; horario_encontro: string } | null,
  scheduleLocal: string,
) {
  const destination = team?.funcao || scheduleLocal || "Não informado";
  return team?.ponto_encontro ? `${destination} · encontro: ${team.ponto_encontro}` : destination;
}

function groupAssignmentsByTeam(
  teams: Array<{ equipe_id: number; equipe_nome: string; equipe_cor: string; funcao: string; ponto_encontro: string; horario_encontro: string }>,
  assignments: Array<Record<string, unknown>>,
) {
  const knownIds = new Set(teams.map((team) => team.equipe_id));
  const groups = teams.map((team) => ({
    team,
    assignments: assignments.filter(
      (assignment) => Number(assignment.equipe_id || 0) === team.equipe_id,
    ),
  }));
  const freeAssignments = assignments.filter(
    (assignment) => !knownIds.has(Number(assignment.equipe_id || 0)),
  );
  // A leitura compartilhada deve refletir a formação da escala, inclusive a
  // equipe que ainda não recebeu alguém. Assim fica claro onde há uma vaga,
  // sem misturar os integrantes das outras equipes.
  return freeAssignments.length
    ? [...groups, { team: null, assignments: freeAssignments }]
    : groups;
}

function linkTypeLabel(value: string) {
  return (
    {
      YOUTUBE: "YouTube",
      SPOTIFY: "Spotify",
      CIFRA_CLUB: "Cifra Club",
      GOOGLE_DRIVE: "Google Drive",
      PERSONALIZADO: "Abrir link",
    }[value] || value.replaceAll("_", " ")
  );
}
