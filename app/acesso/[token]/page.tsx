import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { getD1 } from "../../../db";
import TemporaryAccessFlow from "../../components/TemporaryAccessFlow";
import TemporaryScheduleBoundary from "../../components/TemporaryScheduleBoundary";
import { getSessionUser } from "../../lib/local-auth";
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
    return (
      <TemporaryScheduleBoundary token={token}>
        <main className="shared-secretary-page" id="conteudo-escala">
          <header>
            <span className="shared-secretary-brand">V+</span>
            <div>
              <p>VÍNKULO · ACESSO TEMPORÁRIO</p>
              <strong>{temporaryResourceLabel(grant.recurso)}</strong>
            </div>
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
              <h2>Integrantes escalados</h2>
              <ul>
                {schedule.designacoes.map((item) => (
                  <li key={String(item.id)}>
                    <strong>{String(item.nome)}</strong>
                    <span>{String(item.funcao)} · {statusLabel(item.status)}</span>
                  </li>
                ))}
              </ul>
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
          </div>
          <footer>
            Acesso pessoal, temporário e somente leitura · expira em {formatDate(grant.termina_em)}
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
      FEITO: "Feito",
      NAO_FEITO: "Não feito",
    }[String(value || "")] || String(value || "")
  );
}
