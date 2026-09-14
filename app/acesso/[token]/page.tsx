import { cookies } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { CSSProperties } from "react";
import { getD1 } from "../../../db";
import TemporaryAccessFlow from "../../components/TemporaryAccessFlow";
import TemporaryScheduleBoundary from "../../components/TemporaryScheduleBoundary";
import { getSessionUser } from "../../lib/local-auth";
import { groupScheduleResources } from "../../lib/schedule-resources";
import { getSecretaryScheduleDetail } from "../../lib/secretary-schedule";
import { listTenantMemberships } from "../../lib/tenant";
import {
  getTemporaryAccessByToken,
  recordTemporaryAccessAudit,
  TEMPORARY_ACCESS_COOKIE,
  temporaryResourceLabel,
} from "../../lib/temporary-access";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function TemporaryAccessPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ conteudo?: string }>;
}) {
  const token = (await params).token;
  const db = getD1();
  const clock = await db
    .prepare(
      `SELECT CAST(strftime('%s', 'now') AS INTEGER) * 1000 AS agora_ms`,
    )
    .first<{ agora_ms: number }>();
  const serverNow = Number(clock?.agora_ms || 0);
  const grant = await getTemporaryAccessByToken(db, token);
  if (!grant) notFound();
  const user = await getSessionUser();
  await recordTemporaryAccessAudit(
    db,
    grant,
    "ACESSO_TEMPORARIO_LINK_ABERTO",
    "SUCESSO",
    user?.id || null,
  );
  const userMatches = Boolean(
    user && Number(user.id) === Number(grant.beneficiario_usuario_id),
  );
  const memberships = userMatches && user ? await listTenantMemberships(user) : [];
  const communityMatches = memberships.some(
    (membership) =>
      membership.comunidadeId === Number(grant.comunidade_id) &&
      membership.status === "ATIVO",
  );
  const showContent = (await searchParams).conteudo === "1";

  if (showContent) {
    const cookieToken = (await cookies()).get(TEMPORARY_ACCESS_COOKIE)?.value;
    if (
      grant.recurso !== "ESCALA_LEITURA" ||
      grant.status !== "ATIVO" ||
      grant.designacao_status !== "CONFIRMADA" ||
      !userMatches ||
      !communityMatches ||
      cookieToken !== token
    ) {
      return (
        <TemporaryAccessFlow
          token={token}
          resourceLabel={temporaryResourceLabel(grant.recurso)}
          communityName={grant.comunidade_nome}
          scheduleTitle={grant.escala_titulo}
          startsAt={grant.inicia_em}
          endsAt={grant.termina_em}
          initialStatus={grant.status}
          serverNow={serverNow}
          authenticated={Boolean(user)}
          userMatches={userMatches}
          communityMatches={communityMatches}
          beneficiaryName={grant.beneficiario_nome}
          assignmentStatus={grant.designacao_status}
        />
      );
    }
    const schedule = await getSecretaryScheduleDetail(db, grant.escala_id);
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
      <TemporaryScheduleBoundary token={token}>
        <main className="shared-secretary-page" id="conteudo-escala">
          <header>
            <Link className="shared-secretary-brand" href="/" aria-label="Entrar na plataforma">V+</Link>
            <div>
              <p>VÍNKULO · ACESSO TEMPORÁRIO</p>
              <strong>{temporaryResourceLabel(grant.recurso)}</strong>
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
              <div><dt>Sua função</dt><dd>{grant.funcao}</dd></div>
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
                        <small>Destino/local</small>
                        <span>{String(group.team?.funcao || schedule.local || "Não informado")}</span>
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
                    <span>{statusLabel(item.status)}</span>
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
            <span>Acesso pessoal, temporário e somente leitura · expira em {formatDate(grant.termina_em)}</span>
            <Link className="shared-secretary-footer-home" href="/">Ir para tela inicial</Link>
          </footer>
        </main>
      </TemporaryScheduleBoundary>
    );
  }

  return (
    <TemporaryAccessFlow
      token={token}
      resourceLabel={temporaryResourceLabel(grant.recurso)}
      communityName={grant.comunidade_nome}
      scheduleTitle={grant.escala_titulo}
      startsAt={grant.inicia_em}
      endsAt={grant.termina_em}
      initialStatus={grant.status}
      serverNow={serverNow}
      authenticated={Boolean(user)}
      userMatches={userMatches}
      communityMatches={communityMatches}
      beneficiaryName={grant.beneficiario_nome}
      assignmentStatus={grant.designacao_status}
    />
  );
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
      SUBSTITUICAO_SOLICITADA: "Substituição solicitada",
      AUSENTE: "Ausente",
      FEITO: "Feito",
      NAO_FEITO: "Não feito",
    }[String(value || "")] || String(value || "")
  );
}

function groupAssignmentsByTeam(
  teams: Array<{ equipe_id: number; equipe_nome: string; equipe_cor: string; funcao: string }>,
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
