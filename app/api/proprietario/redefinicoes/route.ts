// Fila de aprovação de redefinição de senha do Proprietário.
//
// Trabalha sobre a tabela já existente `redefinicoes_senha`, cujas colunas
// antigas (`token_hash`, `expira_em`, `usado`) continuam sendo consumidas por
// `app/lib/local-auth.ts` (consumeResetToken) — por isso nada aqui altera o
// significado delas: o link gerado em SEND_LINK é exatamente o mesmo formato
// que `createResetToken` produz (sha256 do token em `token_hash`, `usado = 0`,
// `expira_em` curto), e o hash usa a função `sha256` já existente em vez de
// reimplementar criptografia.
//
// O token em claro só existe na resposta de SEND_LINK; listagens nunca o
// expõem.

import { getD1 } from "../../../../db";
import { getSessionUser, sha256 } from "../../../lib/local-auth";

const LINK_MINUTOS = 30;
const STATUSES = [
  "SOLICITADO",
  "EM_ANALISE",
  "APROVADO",
  "RECUSADO",
  "ENVIADO",
  "CONCLUIDO",
  "EXPIRADO",
] as const;

async function owner() {
  const user = await getSessionUser();
  if (!user)
    return {
      error: Response.json({ error: "Faça login para continuar." }, { status: 401 }),
    } as const;
  if (!user.ativo || !user.system_owner)
    return {
      error: Response.json(
        { error: "Esta área é exclusiva do proprietário do sistema." },
        { status: 403 },
      ),
    } as const;
  return { user } as const;
}

async function audit(
  db: ReturnType<typeof getD1>,
  userId: number,
  event: string,
  comunidadeId: number | null,
  metadata: Record<string, unknown>,
) {
  await db
    .prepare(
      "INSERT INTO auditoria_piloto (comunidade_id, usuario_id, evento, resultado, metadados) VALUES (?, ?, ?, 'SUCESSO', ?)",
    )
    .bind(comunidadeId, userId, event, JSON.stringify(metadata))
    .run();
}

const clean = (value: unknown, max: number) => String(value ?? "").trim().slice(0, max);
function id(value: unknown) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 0;
}

type Row = {
  id: number;
  usuario_id: number;
  solicitado_em: string;
  expira_em: string | null;
  usado: number;
  status: string;
  comunidade_id: number | null;
  motivo: string;
  decisao_motivo: string;
  analisado_por: number | null;
  analisado_em: string | null;
  enviado_em: string | null;
  concluido_em: string | null;
  tentativas: number;
  token_hash: string | null;
  solicitante_nome: string | null;
  solicitante_email: string | null;
  solicitante_perfil: string | null;
  comunidade_nome: string | null;
  responsavel_nome: string | null;
};

// Status efetivo: o banco guarda o estado do fluxo, mas `usado`/`expira_em`
// (mexidos pelo fluxo público de login) mandam quando divergem.
function effectiveStatus(row: Row) {
  if (row.status === "RECUSADO") return "RECUSADO";
  if (Number(row.usado) === 1) return "CONCLUIDO";
  const expires = row.expira_em ? Date.parse(row.expira_em.replace(" ", "T") + (row.expira_em.endsWith("Z") ? "" : "Z")) : NaN;
  if (Number.isFinite(expires) && expires <= Date.now()) return "EXPIRADO";
  return STATUSES.includes(row.status as (typeof STATUSES)[number]) ? row.status : "SOLICITADO";
}

function view(row: Row) {
  return {
    id: Number(row.id),
    status: effectiveStatus(row),
    statusRegistrado: row.status,
    solicitante: {
      nome: row.solicitante_nome || "Conta removida",
      email: row.solicitante_email || "",
      perfil: row.solicitante_perfil || "",
    },
    comunidade: row.comunidade_nome || "Sem comunidade vinculada",
    comunidadeId: row.comunidade_id == null ? null : Number(row.comunidade_id),
    solicitadoEm: row.solicitado_em,
    expiraEm: row.expira_em,
    motivo: row.motivo || "",
    decisaoMotivo: row.decisao_motivo || "",
    tentativas: Number(row.tentativas || 0),
    responsavel: row.responsavel_nome || null,
    analisadoEm: row.analisado_em,
    enviadoEm: row.enviado_em,
    concluidoEm: row.concluido_em,
    linkGerado: Boolean(row.token_hash),
  };
}

const SELECT = `SELECT r.id, r.usuario_id, r.solicitado_em, r.expira_em, r.usado, r.status,
    r.comunidade_id, r.motivo, r.decisao_motivo, r.analisado_por, r.analisado_em,
    r.enviado_em, r.concluido_em, r.tentativas, r.token_hash,
    u.nome AS solicitante_nome, u.email AS solicitante_email, u.perfil AS solicitante_perfil,
    c.nome AS comunidade_nome, a.nome AS responsavel_nome
  FROM redefinicoes_senha r
  LEFT JOIN usuarios u ON u.id = r.usuario_id
  LEFT JOIN comunidades c ON c.id = r.comunidade_id
  LEFT JOIN usuarios a ON a.id = r.analisado_por`;

export async function GET(request: Request) {
  const access = await owner();
  if ("error" in access) return access.error;
  const filter = clean(new URL(request.url).searchParams.get("status"), 20).toUpperCase();
  const db = getD1();
  // Tokens de primeiro acesso (`first:%`) pertencem a outro fluxo e não são
  // solicitações de redefinição.
  const rows = await db
    .prepare(
      `${SELECT}
       WHERE (r.token_hash IS NULL OR r.token_hash NOT LIKE 'first:%')
       ORDER BY datetime(r.solicitado_em) DESC, r.id DESC
       LIMIT 300`,
    )
    .all<Row>();
  const all = rows.results.map(view);
  const requests = STATUSES.includes(filter as (typeof STATUSES)[number])
    ? all.filter((item) => item.status === filter)
    : all;
  const resumo = STATUSES.reduce<Record<string, number>>((acc, status) => {
    acc[status] = all.filter((item) => item.status === status).length;
    return acc;
  }, {});
  return Response.json(
    { requests, resumo, linkMinutos: LINK_MINUTOS, geradoEm: new Date().toISOString() },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function PATCH(request: Request) {
  const access = await owner();
  if ("error" in access) return access.error;
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "Conteúdo inválido." }, { status: 400 });
  }
  const requestId = id(body.id);
  if (!requestId) return Response.json({ error: "Solicitação inválida." }, { status: 400 });
  const action = clean(body.action, 30).toUpperCase();
  const motivo = clean(body.motivo, 500);
  const db = getD1();
  const current = await db.prepare(`${SELECT} WHERE r.id = ? LIMIT 1`).bind(requestId).first<Row>();
  if (!current) return Response.json({ error: "Solicitação não encontrada." }, { status: 404 });
  const status = effectiveStatus(current);
  const comunidadeId = current.comunidade_id == null ? null : Number(current.comunidade_id);
  const base = { requestId, usuarioId: Number(current.usuario_id), statusAnterior: status };

  if (status === "CONCLUIDO")
    return Response.json(
      { error: "Esta solicitação já foi concluída pelo próprio solicitante." },
      { status: 409 },
    );

  if (action === "ANALYZE") {
    if (status !== "SOLICITADO")
      return Response.json({ error: "Só solicitações novas entram em análise." }, { status: 409 });
    await db
      .prepare(
        "UPDATE redefinicoes_senha SET status = 'EM_ANALISE', analisado_por = ?, analisado_em = CURRENT_TIMESTAMP WHERE id = ?",
      )
      .bind(access.user.id, requestId)
      .run();
    await audit(db, access.user.id, "REDEFINICAO_EM_ANALISE", comunidadeId, base);
    return Response.json({ ok: true, status: "EM_ANALISE" });
  }

  if (action === "APPROVE") {
    if (status !== "SOLICITADO" && status !== "EM_ANALISE")
      return Response.json(
        { error: "Só é possível aprovar solicitações abertas ou em análise." },
        { status: 409 },
      );
    await db
      .prepare(
        "UPDATE redefinicoes_senha SET status = 'APROVADO', decisao_motivo = ?, analisado_por = ?, analisado_em = CURRENT_TIMESTAMP WHERE id = ?",
      )
      .bind(motivo, access.user.id, requestId)
      .run();
    await audit(db, access.user.id, "REDEFINICAO_APROVADA", comunidadeId, { ...base, motivo });
    return Response.json({ ok: true, status: "APROVADO" });
  }

  if (action === "REJECT") {
    if (!motivo)
      return Response.json({ error: "Informe o motivo da recusa." }, { status: 400 });
    if (status === "RECUSADO")
      return Response.json({ error: "Esta solicitação já foi recusada." }, { status: 409 });
    await db
      .prepare(
        "UPDATE redefinicoes_senha SET status = 'RECUSADO', decisao_motivo = ?, analisado_por = ?, analisado_em = CURRENT_TIMESTAMP, token_hash = NULL, expira_em = datetime('now', '-1 minute') WHERE id = ?",
      )
      .bind(motivo, access.user.id, requestId)
      .run();
    await audit(db, access.user.id, "REDEFINICAO_RECUSADA", comunidadeId, { ...base, motivo });
    return Response.json({ ok: true, status: "RECUSADO" });
  }

  if (action === "EXPIRE") {
    await db
      .prepare(
        "UPDATE redefinicoes_senha SET status = 'EXPIRADO', expira_em = datetime('now', '-1 minute'), token_hash = NULL, analisado_por = ?, analisado_em = CURRENT_TIMESTAMP, decisao_motivo = ? WHERE id = ?",
      )
      .bind(access.user.id, motivo, requestId)
      .run();
    await audit(db, access.user.id, "REDEFINICAO_EXPIRADA", comunidadeId, { ...base, motivo });
    return Response.json({ ok: true, status: "EXPIRADO" });
  }

  if (action === "SEND_LINK") {
    if (status !== "APROVADO" && status !== "ENVIADO")
      return Response.json(
        { error: "Aprove a solicitação antes de gerar o link." },
        { status: 409 },
      );
    const activeUser = await db
      .prepare("SELECT id FROM usuarios WHERE id = ? AND ativo = 1 LIMIT 1")
      .bind(current.usuario_id)
      .first<{ id: number }>();
    if (!activeUser)
      return Response.json(
        { error: "A conta solicitante não está mais ativa." },
        { status: 409 },
      );
    const token = Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) =>
      byte.toString(16).padStart(2, "0"),
    ).join("");
    const expiresAt = new Date(Date.now() + LINK_MINUTOS * 60000).toISOString();
    // Invalida outros links de redefinição em aberto do mesmo usuário, como
    // createResetToken faz, sem tocar nos tokens de primeiro acesso.
    await db
      .prepare(
        `UPDATE redefinicoes_senha SET usado = 1, status = 'EXPIRADO'
         WHERE usuario_id = ? AND id <> ? AND usado = 0
           AND token_hash IS NOT NULL AND token_hash NOT LIKE 'first:%'`,
      )
      .bind(current.usuario_id, requestId)
      .run();
    await db
      .prepare(
        `UPDATE redefinicoes_senha
         SET token_hash = ?, expira_em = ?, usado = 0, status = 'ENVIADO',
             enviado_em = CURRENT_TIMESTAMP, tentativas = tentativas + 1,
             analisado_por = COALESCE(analisado_por, ?)
         WHERE id = ?`,
      )
      .bind(await sha256(token), expiresAt, access.user.id, requestId)
      .run();
    await audit(db, access.user.id, "REDEFINICAO_LINK_GERADO", comunidadeId, {
      ...base,
      expiraEm: expiresAt,
    });
    return Response.json({
      ok: true,
      status: "ENVIADO",
      // Única vez em que o token aparece em claro.
      link: `/redefinir-senha?token=${encodeURIComponent(token)}`,
      expiraEm: expiresAt,
      minutos: LINK_MINUTOS,
    });
  }

  return Response.json({ error: "Ação não reconhecida." }, { status: 400 });
}
