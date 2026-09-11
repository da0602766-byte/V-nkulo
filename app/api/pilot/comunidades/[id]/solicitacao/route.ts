import { getD1 } from "../../../../../../db";
import { parseJoinRequestMessage } from "../../../../../lib/feed-validation";
import { getSessionUser } from "../../../../../lib/local-auth";
import { notifyCommunityManagers } from "../../../../../lib/pilot-notifications";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context) {
  const user = await getSessionUser();
  if (!user) {
    return Response.json(
      { error: "Faça login para solicitar entrada." },
      { status: 401 },
    );
  }
  if (!user.ativo) {
    return Response.json({ error: "Usuário inativo." }, { status: 403 });
  }
  const comunidadeId = Number((await context.params).id);
  if (!Number.isInteger(comunidadeId) || comunidadeId <= 0) {
    return Response.json({ error: "Comunidade inválida." }, { status: 400 });
  }
  const payload = (await request.json()) as { mensagem?: unknown };
  const mensagem = parseJoinRequestMessage(payload.mensagem);
  const db = getD1();
  const community = await db
    .prepare(
      `SELECT id, nome FROM comunidades
      WHERE id = ? AND status = 'ATIVA' LIMIT 1`,
    )
    .bind(comunidadeId)
    .first<{ id: number; nome: string }>();
  if (!community) {
    return Response.json(
      { error: "Comunidade não encontrada." },
      { status: 404 },
    );
  }
  const membership = await db
    .prepare(
      `SELECT id FROM usuario_comunidades
      WHERE usuario_id = ? AND comunidade_id = ? AND status = 'ATIVO'
      LIMIT 1`,
    )
    .bind(user.id, comunidadeId)
    .first<{ id: number }>();
  if (membership) {
    return Response.json(
      { error: "Você já participa desta comunidade." },
      { status: 409 },
    );
  }
  const previous = await db
    .prepare(
      `SELECT status FROM solicitacoes_entrada_comunidade
      WHERE usuario_id = ? AND comunidade_id = ? LIMIT 1`,
    )
    .bind(user.id, comunidadeId)
    .first<{ status: string }>();
  if (previous?.status === "PENDENTE") {
    return Response.json(
      { error: "Sua solicitação já está aguardando análise." },
      { status: 409 },
    );
  }
  await db.batch([
    db
      .prepare(
        `INSERT INTO solicitacoes_entrada_comunidade
        (comunidade_id, usuario_id, mensagem, status)
        VALUES (?, ?, ?, 'PENDENTE')
        ON CONFLICT(usuario_id, comunidade_id) DO UPDATE SET
          mensagem = excluded.mensagem,
          status = 'PENDENTE',
          analisado_por = NULL,
          analisado_em = NULL,
          solicitado_em = CURRENT_TIMESTAMP,
          atualizado_em = CURRENT_TIMESTAMP`,
      )
      .bind(comunidadeId, user.id, mensagem),
    db
      .prepare(
        `INSERT INTO auditoria_piloto
        (comunidade_id, usuario_id, evento, resultado, metadados)
        VALUES (?, ?, 'SOLICITACAO_ENTRADA_V45_CRIADA', 'SUCESSO', ?)`,
      )
      .bind(
        comunidadeId,
        user.id,
        JSON.stringify({ mensagemInformada: Boolean(mensagem) }),
      ),
  ]);
  const requestRow = await db
    .prepare(
      `SELECT id FROM solicitacoes_entrada_comunidade
      WHERE usuario_id = ? AND comunidade_id = ? LIMIT 1`,
    )
    .bind(user.id, comunidadeId)
    .first<{ id: number }>();
  if (requestRow) {
    await notifyCommunityManagers(db, {
      communityId: comunidadeId,
      communityName: community.nome,
      applicantName: user.nome,
      requestId: Number(requestRow.id),
      createdBy: user.email,
    });
  }
  return Response.json(
    { ok: true, status: "PENDENTE", requestId: requestRow?.id || null },
    { status: 201 },
  );
}
