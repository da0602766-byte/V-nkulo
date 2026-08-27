import { getD1 } from "../../../../../db";
import { normalizeEmail } from "../../../../lib/local-auth";
import { notifyCommunityManagers } from "../../../../lib/pilot-notifications";
import {
  getMemberRegistrationLinkByToken,
  isMemberRegistrationLinkOpen,
} from "../../../../lib/member-registration-links";

type Context = { params: Promise<{ token: string }> };

const VALID_DAYS = new Set(["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SAB"]);
const VALID_PERIODS = new Set(["MANHA", "TARDE", "NOITE", "FLEXIVEL"]);

export async function GET(_request: Request, context: Context) {
  const token = (await context.params).token;
  const db = getD1();
  const link = await getMemberRegistrationLinkByToken(db, token);
  if (!link || !isMemberRegistrationLinkOpen(link)) {
    return Response.json({ error: "Este link é inválido, foi cancelado ou expirou." }, { status: 404 });
  }
  const communities = await db
    .prepare(
      `SELECT id, nome FROM comunidades
       WHERE proprietario_usuario_id = ? AND status = 'ATIVA'
       ORDER BY nome`,
    )
    .bind(link.ownerId)
    .all<{ id: number; nome: string }>();
  const communityIds = communities.results.map((community) => community.id);
  const ministriesByComunidade: Record<number, { id: number; nome: string }[]> = {};
  for (const id of communityIds) ministriesByComunidade[id] = [];
  if (communityIds.length) {
    const placeholders = communityIds.map(() => "?").join(", ");
    const ministries = await db
      .prepare(
        `SELECT id, comunidade_id, nome FROM ministerios_comunidade
         WHERE comunidade_id IN (${placeholders}) AND status = 'ATIVO'
         ORDER BY nome`,
      )
      .bind(...communityIds)
      .all<{ id: number; comunidade_id: number; nome: string }>();
    for (const ministry of ministries.results) {
      (ministriesByComunidade[ministry.comunidade_id] ||= []).push({
        id: ministry.id,
        nome: ministry.nome,
      });
    }
  }
  return Response.json(
    {
      expiresAt: link.expiresAt,
      communities: communities.results.map((community) => ({
        id: community.id,
        nome: community.nome,
        ministerios: ministriesByComunidade[community.id] || [],
      })),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: Request, context: Context) {
  const token = (await context.params).token;
  const db = getD1();
  const link = await getMemberRegistrationLinkByToken(db, token);
  if (!link || !isMemberRegistrationLinkOpen(link)) {
    return Response.json({ error: "Este link é inválido, foi cancelado ou expirou." }, { status: 404 });
  }
  const payload = await safeJson(request);
  if (!payload) return Response.json({ error: "Dados inválidos." }, { status: 400 });

  const nome = clean(payload.nome, 120);
  const email = normalizeEmail(payload.email);
  const cpf = clean(payload.cpf, 20);
  const cep = clean(payload.cep, 12);
  const dataNascimento = clean(payload.dataNascimento, 10);
  const telefone = clean(payload.telefone, 30);
  const comunidadeId = Number(payload.comunidadeId || 0);
  const ministerioId = payload.ministerioId ? Number(payload.ministerioId) : null;
  const periodoPreferido = clean(payload.periodoPreferido, 20).toUpperCase() || "FLEXIVEL";
  const diasDisponiveis = Array.isArray(payload.diasDisponiveis)
    ? [...new Set(payload.diasDisponiveis.map((day) => String(day).toUpperCase()))].filter((day) =>
        VALID_DAYS.has(day),
      )
    : [];
  const funcaoDesejada = clean(payload.funcaoDesejada, 60);

  if (nome.length < 3) {
    return Response.json({ error: "Informe o nome completo." }, { status: 400 });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 180) {
    return Response.json({ error: "Informe um e-mail válido." }, { status: 400 });
  }
  if (!cep) {
    return Response.json({ error: "Informe o CEP." }, { status: 400 });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dataNascimento) || Number.isNaN(Date.parse(dataNascimento))) {
    return Response.json({ error: "Informe uma data de nascimento válida." }, { status: 400 });
  }
  if (!VALID_PERIODS.has(periodoPreferido)) {
    return Response.json({ error: "Período preferido inválido." }, { status: 400 });
  }

  const community = await db
    .prepare(
      `SELECT id, nome FROM comunidades
       WHERE id = ? AND proprietario_usuario_id = ? AND status = 'ATIVA' LIMIT 1`,
    )
    .bind(comunidadeId, link.ownerId)
    .first<{ id: number; nome: string }>();
  if (!community) {
    return Response.json({ error: "Selecione uma comunidade válida deste link." }, { status: 400 });
  }

  let ministry: { id: number; nome: string } | null = null;
  if (ministerioId) {
    ministry = await db
      .prepare(
        `SELECT id, nome FROM ministerios_comunidade
         WHERE id = ? AND comunidade_id = ? AND status = 'ATIVO' LIMIT 1`,
      )
      .bind(ministerioId, comunidadeId)
      .first<{ id: number; nome: string }>();
    if (!ministry) {
      return Response.json({ error: "Selecione um ministério válido desta comunidade." }, { status: 400 });
    }
  }

  const existing = await db
    .prepare("SELECT id, senha_hash FROM usuarios WHERE email = ? LIMIT 1")
    .bind(email)
    .first<{ id: number; senha_hash: string | null }>();
  if (existing?.senha_hash) {
    return Response.json(
      {
        error:
          "Já existe uma conta com este e-mail. Entre e solicite acesso pela lista de comunidades.",
      },
      { status: 409 },
    );
  }

  const cadastroDados = JSON.stringify({
    cpf: cpf ? { label: "CPF", value: cpf } : undefined,
    cep: { label: "CEP", value: cep },
  });

  let userId: number;
  if (existing) {
    userId = existing.id;
    await db
      .prepare(
        `UPDATE usuarios SET nome = ?, telefone = ?, data_nascimento = ?, cadastro_dados = ?,
           atualizado_em = CURRENT_TIMESTAMP WHERE id = ?`,
      )
      .bind(nome, telefone || null, dataNascimento, cadastroDados, userId)
      .run();
  } else {
    const result = await db
      .prepare(
        `INSERT INTO usuarios (nome, email, perfil, permissoes, telefone, data_nascimento, cadastro_dados, ativo)
         VALUES (?, ?, 'LEITURA', '', ?, ?, ?, 1)`,
      )
      .bind(nome, email, telefone || null, dataNascimento, cadastroDados)
      .run();
    userId = Number(result.meta.last_row_id);
  }

  const activeMembership = await db
    .prepare(
      `SELECT id FROM usuario_comunidades WHERE usuario_id = ? AND comunidade_id = ? AND status = 'ATIVO' LIMIT 1`,
    )
    .bind(userId, comunidadeId)
    .first<{ id: number }>();
  if (activeMembership) {
    return Response.json(
      { error: "Você já participa desta comunidade." },
      { status: 409 },
    );
  }

  const previousRequest = await db
    .prepare(
      `SELECT status FROM solicitacoes_entrada_comunidade WHERE usuario_id = ? AND comunidade_id = ? LIMIT 1`,
    )
    .bind(userId, comunidadeId)
    .first<{ status: string }>();
  if (previousRequest?.status === "PENDENTE") {
    return Response.json(
      { error: "Sua solicitação para esta comunidade já está aguardando análise." },
      { status: 409 },
    );
  }

  const mensagem = composeRequestMessage({
    ministryName: ministry?.nome || "",
    funcaoDesejada,
    periodoPreferido,
    diasDisponiveis,
  });

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
      .bind(comunidadeId, userId, mensagem),
    db
      .prepare(
        `INSERT INTO auditoria_piloto
         (comunidade_id, usuario_id, evento, resultado, metadados)
         VALUES (?, ?, 'CADASTRO_MEMBRO_LINK_ENVIADO', 'SUCESSO', ?)`,
      )
      .bind(
        comunidadeId,
        userId,
        JSON.stringify({ ministerioId: ministry?.id || null, periodoPreferido, diasDisponiveis }),
      ),
  ]);

  const requestRow = await db
    .prepare(
      `SELECT id FROM solicitacoes_entrada_comunidade WHERE usuario_id = ? AND comunidade_id = ? LIMIT 1`,
    )
    .bind(userId, comunidadeId)
    .first<{ id: number }>();
  if (requestRow) {
    await notifyCommunityManagers(db, {
      communityId: comunidadeId,
      communityName: community.nome,
      applicantName: nome,
      requestId: Number(requestRow.id),
      createdBy: "link-cadastro-membro",
    });
  }

  return Response.json(
    {
      ok: true,
      message:
        "Cadastro enviado! Assim que o responsável aprovar, você recebe um link para definir sua senha e acessar.",
    },
    { status: 201 },
  );
}

function composeRequestMessage(options: {
  ministryName: string;
  funcaoDesejada: string;
  periodoPreferido: string;
  diasDisponiveis: string[];
}) {
  const parts = ["Cadastro via link temporário de novos membros."];
  if (options.ministryName) {
    parts.push(
      `Interesse em servir: ${options.ministryName}${options.funcaoDesejada ? ` (${options.funcaoDesejada})` : ""}.`,
    );
    parts.push(`Período preferido: ${periodLabel(options.periodoPreferido)}.`);
    if (options.diasDisponiveis.length) {
      parts.push(`Dias disponíveis: ${options.diasDisponiveis.join(", ")}.`);
    }
  }
  return parts.join(" ").slice(0, 500);
}

function periodLabel(value: string) {
  return (
    { MANHA: "Manhã", TARDE: "Tarde", NOITE: "Noite", FLEXIVEL: "Flexível" }[value] || "Flexível"
  );
}

function clean(value: unknown, length: number) {
  return String(value ?? "").trim().slice(0, length);
}

async function safeJson(request: Request) {
  try {
    return (await request.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}
