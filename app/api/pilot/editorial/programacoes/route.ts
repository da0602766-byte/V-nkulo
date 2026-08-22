import { getD1 } from "../../../../../db";
import { publishDueEditorialEntries } from "../../../../lib/editorial-scheduler";
import { verifyPassword } from "../../../../lib/local-auth";
import { recordTenantAudit } from "../../../../lib/tenant-audit";
import { requireTenantPermission } from "../../../../lib/tenant";

const CATEGORIES = new Set([
  "VERSICULOS_COM_REFERENCIA",
  "DICAS_DA_PLATAFORMA",
  "TUTORIAIS",
  "CURIOSIDADES",
  "SEGURANCA",
  "BOAS_PRATICAS",
  "NOVIDADES_OFICIAIS",
]);

export async function GET() {
  const access = await editorialAccess();
  if (access instanceof Response) return access;
  const db = getD1();
  await publishDueEditorialEntries(db);
  const queue = await db
    .prepare(
      `SELECT p.id, p.comunidade_id, c.nome AS comunidade_nome, p.titulo,
        p.mensagem, p.categoria, p.referencia, p.imagem_url, p.imagem_alt,
        p.visibilidade, p.comentarios_habilitados, p.status, p.publicar_em,
        p.autorizado_em, p.cancelado_em, p.publicacao_id, p.criado_em
       FROM programacoes_editoriais p
       JOIN comunidades c ON c.id = p.comunidade_id
       ORDER BY
         CASE p.status
           WHEN 'AGENDADA' THEN 0 WHEN 'RASCUNHO' THEN 1
           WHEN 'FALHA' THEN 2 WHEN 'BLOQUEADA' THEN 3 ELSE 4 END,
         p.publicar_em, p.id DESC
       LIMIT 50`,
    )
    .all<Record<string, unknown>>();
  return Response.json(
    {
      queue: queue.results,
      safeguards: {
        humanAuthorizationRequired: true,
        cancellableUntilDispatch: true,
        aiGenerationConnected: false,
      },
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: Request) {
  const access = await editorialAccess();
  if (access instanceof Response) return access;
  const payload = await safeJson(request);
  if (!payload) return badRequest("Os dados da programação são inválidos.");
  const parsed = parseSchedule(payload);
  if ("error" in parsed) return badRequest(parsed.error);
  const db = getD1();
  const community = await db
    .prepare("SELECT id FROM comunidades WHERE id = ? AND status = 'ATIVA' LIMIT 1")
    .bind(parsed.comunidadeId)
    .first<{ id: number }>();
  if (!community) {
    return Response.json(
      { error: "A comunidade precisa estar ativa." },
      { status: 409 },
    );
  }
  const authorizeNow = payload.authorizeNow === true;
  if (authorizeNow) {
    const password = String(payload.password || "");
    if (!password) return badRequest("Confirme sua senha para autorizar.");
    const credentials = await db
      .prepare(
        `SELECT senha_hash, senha_salt FROM usuarios
         WHERE id = ? AND ativo = 1 LIMIT 1`,
      )
      .bind(access.user.id)
      .first<{ senha_hash: string | null; senha_salt: string | null }>();
    if (
      !credentials?.senha_hash ||
      !credentials.senha_salt ||
      !(await verifyPassword(password, credentials.senha_salt, credentials.senha_hash))
    ) {
      await recordTenantAudit(
        db,
        { ...access.context, comunidadeId: parsed.comunidadeId },
        access.user.id,
        "EDITORIAL_PROGRAMACAO_AUTORIZACAO",
        "NEGADO",
        { criacaoDireta: true },
      );
      return Response.json(
        { error: "Senha inválida. Nada foi salvo ou autorizado." },
        { status: 401 },
      );
    }
  }
  const initialStatus = authorizeNow ? "AGENDADA" : "RASCUNHO";
  const created = await db
    .prepare(
      `INSERT INTO programacoes_editoriais
       (comunidade_id, titulo, mensagem, categoria, referencia, imagem_url,
        imagem_alt, visibilidade, comentarios_habilitados, status,
        publicar_em, criado_por, autorizado_por, autorizado_em)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
         CASE WHEN ? = 'AGENDADA' THEN CURRENT_TIMESTAMP ELSE NULL END)`,
    )
    .bind(
      parsed.comunidadeId,
      parsed.titulo,
      parsed.mensagem,
      parsed.categoria,
      parsed.referencia,
      parsed.imagemUrl,
      parsed.imagemAlt,
      parsed.visibilidade,
      parsed.comentariosHabilitados ? 1 : 0,
      initialStatus,
      parsed.publicarEm,
      access.user.id,
      authorizeNow ? access.user.id : null,
      initialStatus,
    )
    .run();
  const id = Number(created.meta.last_row_id);
  await recordTenantAudit(
    db,
    { ...access.context, comunidadeId: parsed.comunidadeId },
    access.user.id,
    "EDITORIAL_PROGRAMACAO_CRIADA",
    "SUCESSO",
    { programacaoId: id, categoria: parsed.categoria, autorizada: authorizeNow },
  );
  return Response.json(
    {
      id,
      status: initialStatus,
      message: authorizeNow
        ? "Publicação autorizada e adicionada à fila programada."
        : "Programação salva. Confirme sua senha para autorizar o envio.",
    },
    { status: 201 },
  );
}

export async function PATCH(request: Request) {
  const access = await editorialAccess();
  if (access instanceof Response) return access;
  const payload = await safeJson(request);
  if (!payload) return badRequest("A solicitação é inválida.");
  const id = Number(payload.id || 0);
  const action = String(payload.action || "").toUpperCase();
  if (!Number.isInteger(id) || id <= 0) return badRequest("Programação inválida.");
  if (!["AUTORIZAR", "CANCELAR"].includes(action)) return badRequest("Ação inválida.");
  const db = getD1();
  const row = await db
    .prepare(
      `SELECT id, comunidade_id, status, publicar_em
       FROM programacoes_editoriais WHERE id = ? LIMIT 1`,
    )
    .bind(id)
    .first<{
      id: number;
      comunidade_id: number;
      status: string;
      publicar_em: string;
    }>();
  if (!row) return Response.json({ error: "Programação não encontrada." }, { status: 404 });

  if (action === "CANCELAR") {
    if (!["RASCUNHO", "AGENDADA", "FALHA", "BLOQUEADA"].includes(row.status)) {
      return Response.json(
        { error: "Esta publicação não pode mais ser cancelada." },
        { status: 409 },
      );
    }
    await db
      .prepare(
        `UPDATE programacoes_editoriais
         SET status = 'CANCELADA', cancelado_por = ?,
           cancelado_em = CURRENT_TIMESTAMP, atualizado_em = CURRENT_TIMESTAMP
         WHERE id = ? AND status IN ('RASCUNHO','AGENDADA','FALHA','BLOQUEADA')`,
      )
      .bind(access.user.id, id)
      .run();
    await recordTenantAudit(
      db,
      { ...access.context, comunidadeId: row.comunidade_id },
      access.user.id,
      "EDITORIAL_PROGRAMACAO_CANCELADA",
      "SUCESSO",
      { programacaoId: id },
    );
    return Response.json({ ok: true, status: "CANCELADA", message: "Publicação cancelada." });
  }

  if (row.status !== "RASCUNHO") {
    return Response.json(
      { error: "Somente uma programação em rascunho pode ser autorizada." },
      { status: 409 },
    );
  }
  if (new Date(`${row.publicar_em.replace(" ", "T")}Z`).getTime() <= Date.now()) {
    return badRequest("Escolha um horário futuro antes de autorizar.");
  }
  const password = String(payload.password || "");
  if (!password) return badRequest("Confirme sua senha para autorizar.");
  const credentials = await db
    .prepare(
      `SELECT senha_hash, senha_salt FROM usuarios
       WHERE id = ? AND ativo = 1 LIMIT 1`,
    )
    .bind(access.user.id)
    .first<{ senha_hash: string | null; senha_salt: string | null }>();
  if (
    !credentials?.senha_hash ||
    !credentials.senha_salt ||
    !(await verifyPassword(password, credentials.senha_salt, credentials.senha_hash))
  ) {
    await recordTenantAudit(
      db,
      { ...access.context, comunidadeId: row.comunidade_id },
      access.user.id,
      "EDITORIAL_PROGRAMACAO_AUTORIZACAO",
      "NEGADO",
      { programacaoId: id },
    );
    return Response.json({ error: "Senha inválida. Nada foi autorizado." }, { status: 401 });
  }
  await db
    .prepare(
      `UPDATE programacoes_editoriais
       SET status = 'AGENDADA', autorizado_por = ?,
         autorizado_em = CURRENT_TIMESTAMP, atualizado_em = CURRENT_TIMESTAMP
       WHERE id = ? AND status = 'RASCUNHO'`,
    )
    .bind(access.user.id, id)
    .run();
  await recordTenantAudit(
    db,
    { ...access.context, comunidadeId: row.comunidade_id },
    access.user.id,
    "EDITORIAL_PROGRAMACAO_AUTORIZADA",
    "SUCESSO",
    { programacaoId: id, publicarEm: row.publicar_em },
  );
  return Response.json({
    ok: true,
    status: "AGENDADA",
    message: "Publicação autorizada. A contagem regressiva foi iniciada.",
  });
}

async function editorialAccess() {
  const access = await requireTenantPermission("platform.admin.view");
  if ("error" in access) return access.error;
  if (!access.context.isSuperadmin) {
    return Response.json(
      { error: "Somente o proprietário pode administrar a programação editorial." },
      { status: 403 },
    );
  }
  return access;
}

function parseSchedule(payload: Record<string, unknown>) {
  const comunidadeId = Number(payload.comunidadeId || 0);
  const titulo = clean(payload.titulo, 140);
  const mensagem = clean(payload.mensagem, 5000);
  const categoria = String(payload.categoria || "").toUpperCase();
  const referencia = clean(payload.referencia, 260);
  const imagemUrl = clean(payload.imagemUrl, 500);
  const imagemAlt = clean(payload.imagemAlt, 180);
  const visibilidade = "COMUNIDADE";
  const date = new Date(String(payload.publicarEm || ""));
  if (!Number.isInteger(comunidadeId) || comunidadeId <= 0)
    return { error: "Selecione uma comunidade." } as const;
  if (titulo.length < 4) return { error: "Informe um título com pelo menos 4 caracteres." } as const;
  if (mensagem.length < 20) return { error: "A mensagem precisa ter pelo menos 20 caracteres." } as const;
  if (!CATEGORIES.has(categoria)) return { error: "Categoria não permitida." } as const;
  if (categoria === "VERSICULOS_COM_REFERENCIA" && referencia.length < 3)
    return { error: "Informe a referência bíblica conferível." } as const;
  if (Number.isNaN(date.getTime()) || date.getTime() < Date.now() + 30_000)
    return { error: "Escolha uma data futura para a publicação." } as const;
  if (imagemUrl && !/^\/api\/pilot\/uploads\/images\/post-image\//.test(imagemUrl))
    return { error: "Envie a imagem pelo seletor seguro da plataforma." } as const;
  return {
    comunidadeId,
    titulo,
    mensagem,
    categoria,
    referencia,
    imagemUrl,
    imagemAlt,
    visibilidade,
    comentariosHabilitados: payload.comentariosHabilitados !== false,
    publicarEm: date.toISOString().replace("T", " ").slice(0, 19),
  };
}

async function safeJson(request: Request) {
  try {
    return (await request.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function clean(value: unknown, maximum: number) {
  return String(value ?? "").trim().slice(0, maximum);
}

function badRequest(error: string) {
  return Response.json({ error }, { status: 400 });
}
