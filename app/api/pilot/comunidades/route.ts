import { getD1 } from "../../../../db";
import { getSessionUser } from "../../../lib/local-auth";
import {
  DEFAULT_COMMUNITY_CREATION_FIELDS,
  parseCommunityCreationAnswers,
  parseCommunityCreationFields,
} from "../../../lib/community-creation";
import { normalizeCommunityModules } from "../../../lib/community-modules";
import { getActiveTenantContext } from "../../../lib/tenant";
import { recordTenantAudit } from "../../../lib/tenant-audit";

function clean(value: unknown, maximum: number) {
  return String(value ?? "").trim().slice(0, maximum);
}

export async function GET() {
  const user = await getSessionUser();
  if (!user) {
    return Response.json({ error: "Faça login para continuar." }, { status: 401 });
  }
  const tenant = await getActiveTenantContext(user);
  if (!tenant.context) {
    return Response.json({ error: "Selecione uma comunidade." }, { status: 409 });
  }
  const row = await getD1()
    .prepare(
      `SELECT id, nome, slug, descricao_publica, cidade_publica, criado_em
       FROM comunidades WHERE id = ? AND status = 'ATIVA' LIMIT 1`,
    )
    .bind(tenant.context.comunidadeId)
    .first<Record<string, unknown>>();
  if (!row) {
    return Response.json({ error: "Comunidade não encontrada." }, { status: 404 });
  }
  return Response.json(
    {
      community: {
        id: Number(row.id),
        nome: String(row.nome || ""),
        slug: String(row.slug || ""),
        descricao: String(row.descricao_publica || ""),
        cidade: String(row.cidade_publica || ""),
        criadoEm: String(row.criado_em || ""),
      },
      canEdit:
        Boolean(user.system_owner) ||
        tenant.context.isCommunityOwner ||
        tenant.context.communityAccess === "OWNER" ||
        tenant.context.papel === "ADMIN_COMUNIDADE",
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

/**
 * Registra apenas uma solicitação. A comunidade só nasce depois da análise
 * e ativação explícita pelo proprietário global na Área do Proprietário.
 */
export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return Response.json(
      { error: "Crie uma conta ou entre para solicitar uma comunidade." },
      { status: 401 },
    );
  }
  if (!user.ativo) {
    return Response.json({ error: "Usuário inativo." }, { status: 403 });
  }
  let payload: Record<string, unknown>;
  try {
    payload = (await request.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "A ficha enviada é inválida." }, { status: 400 });
  }
  const nome = clean(payload.nome, 120);
  const descricao = clean(payload.descricao, 600);
  const cidade = clean(payload.cidade, 120);
  const emailInstitucional = clean(payload.emailInstitucional, 180).toLowerCase();
  if (
    nome.length < 3 ||
    descricao.length < 20 ||
    cidade.length < 2 ||
    !/^\S+@\S+\.\S+$/.test(emailInstitucional)
  ) {
    return Response.json(
      { error: "Informe nome, cidade, descrição e e-mail institucional válidos." },
      { status: 400 },
    );
  }
  const db = getD1();
  const configRow = await db
    .prepare(
      "SELECT valor FROM configuracoes WHERE chave = 'community_creation_form:v1' LIMIT 1",
    )
    .first<{ valor: string }>();
  let fieldSource: unknown = DEFAULT_COMMUNITY_CREATION_FIELDS;
  try {
    if (configRow?.valor) fieldSource = JSON.parse(configRow.valor);
  } catch {
    fieldSource = DEFAULT_COMMUNITY_CREATION_FIELDS;
  }
  const fields = parseCommunityCreationFields(fieldSource);
  const answers = parseCommunityCreationAnswers(payload.extraFields, fields);
  if ("error" in answers) {
    return Response.json({ error: answers.error }, { status: 400 });
  }
  const modules = normalizeCommunityModules(payload.modules, []);
  if (!modules.length) {
    return Response.json(
      { error: "Selecione ao menos uma aba operacional para a comunidade." },
      { status: 400 },
    );
  }
  const duplicate = await db
    .prepare(
      `SELECT id FROM solicitacoes_criacao_comunidade
       WHERE solicitante_id = ? AND status IN ('PENDENTE', 'EM_ANALISE')
       LIMIT 1`,
    )
    .bind(user.id)
    .first<{ id: number }>();
  if (duplicate) {
    return Response.json(
      {
        error:
          "Você já possui uma solicitação em análise. Aguarde a decisão do proprietário.",
      },
      { status: 409 },
    );
  }
  const result = await db
    .prepare(
      `INSERT INTO solicitacoes_criacao_comunidade
       (solicitante_id, nome, descricao, cidade, email_institucional,
        ficha_criacao, status)
       VALUES (?, ?, ?, ?, ?, ?, 'PENDENTE')`,
    )
    .bind(
      user.id,
      nome,
      descricao,
      cidade,
      emailInstitucional,
      JSON.stringify({ respostas: answers.data, modules }),
    )
    .run();
  const requestId = Number(result.meta.last_row_id);
  await db
    .prepare(
      `INSERT INTO auditoria_piloto
       (comunidade_id, usuario_id, evento, resultado, metadados)
       VALUES (NULL, ?, 'SOLICITACAO_CRIACAO_COMUNIDADE_REGISTRADA', 'SUCESSO', ?)`,
    )
    .bind(
      user.id,
      JSON.stringify({ solicitacaoId: requestId, nome, cidade, modules }),
    )
    .run();
  return Response.json(
    {
      requestId,
      status: "PENDENTE",
      message:
        "Solicitação enviada. O proprietário revisará, configurará e ativará a comunidade.",
    },
    { status: 202 },
  );
}

export async function PATCH(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return Response.json({ error: "Faça login para continuar." }, { status: 401 });
  }
  const tenant = await getActiveTenantContext(user);
  if (!tenant.context) {
    return Response.json({ error: "Selecione uma comunidade." }, { status: 409 });
  }
  const canEdit =
    Boolean(user.system_owner) ||
    tenant.context.isCommunityOwner ||
    tenant.context.communityAccess === "OWNER" ||
    tenant.context.papel === "ADMIN_COMUNIDADE";
  if (!canEdit) {
    return Response.json(
      { error: "Você não pode editar esta comunidade." },
      { status: 403 },
    );
  }
  const payload = (await request.json()) as Record<string, unknown>;
  const nome = clean(payload.nome, 120);
  const descricao = clean(payload.descricao, 600);
  const cidade = clean(payload.cidade, 120);
  if (nome.length < 3 || descricao.length < 20 || cidade.length < 2) {
    return Response.json(
      { error: "Informe nome, cidade e uma descrição com pelo menos 20 caracteres." },
      { status: 400 },
    );
  }
  const db = getD1();
  await db
    .prepare(
      `UPDATE comunidades SET nome = ?, descricao_publica = ?, cidade_publica = ?
       WHERE id = ? AND status = 'ATIVA'`,
    )
    .bind(nome, descricao, cidade, tenant.context.comunidadeId)
    .run();
  await recordTenantAudit(
    db,
    tenant.context,
    user.id,
    "PERFIL_DA_COMUNIDADE_ATUALIZADO",
    "SUCESSO",
    { comunidadeId: tenant.context.comunidadeId },
  );
  return Response.json({ updated: true });
}
