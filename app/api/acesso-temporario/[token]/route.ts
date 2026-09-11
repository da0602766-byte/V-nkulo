import { cookies } from "next/headers";
import { getD1 } from "../../../../db";
import { getSessionUser } from "../../../lib/local-auth";
import { hasScheduleConflict } from "../../../lib/ministry-access";
import { notifyUser } from "../../../lib/pilot-notifications";
import {
  assignScheduleSubstitute,
  listScheduleSubstitutionCandidates,
} from "../../../lib/schedule-substitution";
import {
  attachActiveCommunityCookie,
  listTenantMemberships,
} from "../../../lib/tenant";
import {
  attachTemporaryAccessCookie,
  getTemporaryAccessByToken,
  markTemporaryAccessActivated,
  recordTemporaryAccessAudit,
  temporaryResourceDestination,
  temporaryResourceLabel,
} from "../../../lib/temporary-access";

type Context = { params: Promise<{ token: string }> };

export async function GET(_request: Request, context: Context) {
  const token = (await context.params).token;
  const db = getD1();
  const grant = await getTemporaryAccessByToken(db, token);
  if (!grant) {
    return Response.json(
      { error: "Autorização temporária inválida." },
      { status: 404 },
    );
  }
  const user = await getSessionUser();
  const authenticated = Boolean(user);
  const userMatches = Boolean(
    user && Number(user.id) === Number(grant.beneficiario_usuario_id),
  );
  let communityMatches = false;
  if (userMatches && user) {
    const memberships = await listTenantMemberships(user);
    communityMatches = memberships.some(
      (membership) =>
        membership.comunidadeId === Number(grant.comunidade_id) &&
        membership.status === "ATIVO",
    );
  }
  const replacementCandidates =
    userMatches && communityMatches && user && grant.designacao_status === "PENDENTE"
      ? await listScheduleSubstitutionCandidates(db, {
          comunidadeId: grant.comunidade_id,
          escalaId: grant.escala_id,
          usuarioAtualId: user.id,
        })
      : [];
  return Response.json(
    {
      id: grant.id,
      status: grant.status,
      recurso: grant.recurso,
      recursoLabel: temporaryResourceLabel(grant.recurso),
      comunidadeNome: grant.comunidade_nome,
      escalaTitulo: grant.escala_titulo,
      iniciaEm: grant.inicia_em,
      terminaEm: grant.termina_em,
      serverNow: Date.now(),
      authenticated,
      userMatches,
      communityMatches,
      beneficiaryName: grant.beneficiario_nome,
      assignmentStatus: grant.designacao_status,
      replacementCandidates,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: Request, context: Context) {
  const token = (await context.params).token;
  const db = getD1();
  const grant = await getTemporaryAccessByToken(db, token);
  if (!grant) {
    return Response.json(
      { error: "Autorização temporária inválida." },
      { status: 404 },
    );
  }
  const user = await getSessionUser();
  if (!user) {
    return Response.json(
      {
        error: "Entre com a conta vinculada a esta escala.",
        login: `/login?returnTo=${encodeURIComponent(`/acesso/${token}`)}`,
      },
      { status: 401 },
    );
  }
  if (!user.ativo) {
    return Response.json(
      { error: "Sua conta está inativa." },
      { status: 403 },
    );
  }
  if (Number(user.id) !== Number(grant.beneficiario_usuario_id)) {
    await recordTemporaryAccessAudit(
      db,
      grant,
      "ACESSO_TEMPORARIO_USUARIO_INCORRETO",
      "NEGADO",
      user.id,
    );
    return Response.json(
      { error: "Este acesso foi autorizado para outra pessoa." },
      { status: 403 },
    );
  }
  const memberships = await listTenantMemberships(user);
  const membership = memberships.find(
    (item) =>
      item.comunidadeId === Number(grant.comunidade_id) &&
      item.status === "ATIVO",
  );
  if (!membership) {
    await recordTemporaryAccessAudit(
      db,
      grant,
      "ACESSO_TEMPORARIO_COMUNIDADE_INCORRETA",
      "NEGADO",
      user.id,
    );
    return Response.json(
      { error: "Sua conta não possui vínculo ativo com esta comunidade." },
      { status: 403 },
    );
  }
  const body = await safeJson(request);
  if (String(body.action || "").toUpperCase() === "RESPONDER_ESCALA") {
    const assignmentStatus = String(body.status || "").toUpperCase();
    if (
      !["CONFIRMADA", "INDISPONIVEL", "SUBSTITUICAO_SOLICITADA"].includes(
        assignmentStatus,
      )
    ) {
      return Response.json({ error: "Resposta de escala inválida." }, { status: 400 });
    }
    if (grant.escala_status !== "PUBLICADA" || !Number(grant.designacao_ativa)) {
      return Response.json(
        { error: "Esta escala não aceita mais confirmações." },
        { status: 409 },
      );
    }
    let replacement:
      | {
          candidate: Awaited<ReturnType<typeof listScheduleSubstitutionCandidates>>[number];
          replacementAssignmentId: number;
          replacementFunction: string;
        }
      | undefined;
    if (assignmentStatus === "CONFIRMADA") {
      if (
        await hasScheduleConflict(db, {
          comunidadeId: grant.comunidade_id,
          usuarioId: user.id,
          iniciaEm: grant.escala_inicia_em,
          terminaEm: grant.escala_termina_em,
          excludeScheduleId: grant.escala_id,
        })
      ) {
        return Response.json(
          { error: "Existe conflito de horário com outra escala desta comunidade." },
          { status: 409 },
        );
      }
      const designationUpdate = await db
        .prepare(
          `UPDATE escala_designacoes
           SET status = 'CONFIRMADA', resposta_em = CURRENT_TIMESTAMP,
             atualizado_em = CURRENT_TIMESTAMP
           WHERE id = ? AND escala_id = ? AND comunidade_id = ?
             AND usuario_id = ? AND ativo = 1 AND status = 'PENDENTE'`,
        )
        .bind(
          grant.designacao_id,
          grant.escala_id,
          grant.comunidade_id,
          user.id,
        )
        .run();
      if (!Number(designationUpdate.meta.changes)) {
        return Response.json(
          { error: "A designação foi alterada enquanto você respondia. Atualize a página." },
          { status: 409 },
        );
      }
    } else {
      const substitutoVoluntarioId = Number(body.substitutoVoluntarioId || 0);
      if (!Number.isInteger(substitutoVoluntarioId) || substitutoVoluntarioId <= 0) {
        return Response.json(
          { error: "Escolha quem poderá ficar no seu lugar antes de continuar." },
          { status: 400 },
        );
      }
      const substitution = await assignScheduleSubstitute(db, {
        comunidadeId: grant.comunidade_id,
        escalaId: grant.escala_id,
        designacaoOriginalId: grant.designacao_id,
        usuarioOriginalId: user.id,
        substitutoVoluntarioId,
        statusOriginal: assignmentStatus as
          | "INDISPONIVEL"
          | "SUBSTITUICAO_SOLICITADA",
      });
      if ("error" in substitution) {
        return Response.json({ error: substitution.error }, { status: 409 });
      }
      replacement = substitution;
      await db
        .prepare(
          `UPDATE acessos_temporarios
           SET status = 'CANCELADO', cancelado_por = ?,
             cancelado_em = CURRENT_TIMESTAMP, atualizado_em = CURRENT_TIMESTAMP
           WHERE id = ? AND comunidade_id = ?
             AND status IN ('PENDENTE','AGUARDANDO_HORARIO','ATIVO')`,
        )
        .bind(user.id, grant.id, grant.comunidade_id)
        .run();
      await notifyUser(db, {
        userId: replacement.candidate.usuarioId,
        title: "Pedido de substituição em escala",
        message: `${user.nome} indicou você para “${grant.escala_titulo}”. Confirme se poderá participar.`,
        entityId: grant.escala_id,
        area: "ESCALAS",
        destination: "/painel?view=ministerios",
        createdBy: String(user.id),
      });
    }
    await recordTemporaryAccessAudit(
      db,
      grant,
      assignmentStatus === "CONFIRMADA"
        ? "ESCALA_CONFIRMADA_PELO_ACESSO_TEMPORARIO"
        : assignmentStatus === "SUBSTITUICAO_SOLICITADA"
          ? "SUBSTITUICAO_SOLICITADA_PELO_ACESSO_TEMPORARIO"
          : "INDISPONIBILIDADE_INFORMADA_PELO_ACESSO_TEMPORARIO",
      "SUCESSO",
      user.id,
      {
        designacaoStatus: assignmentStatus,
        substitutoUsuarioId: replacement?.candidate.usuarioId,
        substitutoVoluntarioId: replacement?.candidate.voluntarioId,
      },
    );
    const managers = await db
      .prepare(
        `SELECT DISTINCT usuario_id FROM (
           SELECT responsavel_usuario_id AS usuario_id
           FROM escalas_ministerio WHERE id = ? AND comunidade_id = ?
           UNION
           SELECT m.responsavel_usuario_id AS usuario_id
           FROM ministerios_comunidade m
           JOIN escalas_ministerio s ON s.ministerio_id = m.id
             AND s.comunidade_id = m.comunidade_id
           WHERE s.id = ? AND s.comunidade_id = ?
           UNION
           SELECT mv.usuario_id
           FROM ministerio_voluntarios mv
           JOIN escalas_ministerio s ON s.ministerio_id = mv.ministerio_id
             AND s.comunidade_id = mv.comunidade_id
           WHERE s.id = ? AND s.comunidade_id = ?
             AND mv.papel = 'LIDER' AND mv.ativo = 1
         ) WHERE usuario_id IS NOT NULL AND usuario_id != ?`,
      )
      .bind(
        grant.escala_id,
        grant.comunidade_id,
        grant.escala_id,
        grant.comunidade_id,
        grant.escala_id,
        grant.comunidade_id,
        user.id,
      )
      .all<{ usuario_id: number }>();
    const responseLabel =
      assignmentStatus === "CONFIRMADA"
        ? "confirmou presença"
        : `indicou ${replacement?.candidate.nome} para substituição`;
    await Promise.all(
      managers.results.map((manager) =>
        notifyUser(db, {
          userId: Number(manager.usuario_id),
          title: "Resposta recebida na escala",
          message: `${user.nome} ${responseLabel} em “${grant.escala_titulo}”.`,
          entityId: grant.escala_id,
          area: "ESCALAS",
          destination: "/painel?view=ministerios",
          createdBy: String(user.id),
        }),
      ),
    );
    return Response.json({
      ok: true,
      assignmentStatus,
      mayEnter: assignmentStatus === "CONFIRMADA",
      replacement,
    });
  }
  if (grant.designacao_status !== "CONFIRMADA") {
    return Response.json(
      {
        error: "Confirme sua participação na escala antes de entrar.",
        assignmentStatus: grant.designacao_status,
        requiresConfirmation: true,
      },
      { status: 409 },
    );
  }
  if (grant.status !== "ATIVO") {
    return Response.json(
      {
        error:
          grant.status === "AGUARDANDO_HORARIO"
            ? "O horário autorizado ainda não começou."
            : `A autorização está ${grant.status.toLocaleLowerCase("pt-BR")}.`,
        status: grant.status,
      },
      { status: 409 },
    );
  }
  await markTemporaryAccessActivated(db, grant, user.id);
  let response = Response.json(
    {
      ok: true,
      status: grant.status,
      destination: temporaryResourceDestination(grant.recurso, token),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
  response = attachTemporaryAccessCookie(response, token, grant.termina_em);
  response = await attachActiveCommunityCookie(
    response,
    membership.membershipId,
  );
  return response;
}

async function safeJson(request: Request) {
  try {
    return (await request.json()) as Record<string, unknown>;
  } catch {
    return {} as Record<string, unknown>;
  }
}

export async function DELETE() {
  const jar = await cookies();
  jar.set("__Host-vinkulo_temp_access", "", {
    httpOnly: true,
    secure: true,
    sameSite: "strict",
    path: "/",
    maxAge: 0,
  });
  return Response.json({ ok: true });
}
