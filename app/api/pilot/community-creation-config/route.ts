import { getD1 } from "../../../../db";
import { getSessionUser } from "../../../lib/local-auth";
import {
  DEFAULT_COMMUNITY_CREATION_FIELDS,
  parseCommunityCreationFields,
} from "../../../lib/community-creation";
import { recordTenantAudit } from "../../../lib/tenant-audit";
import { getActiveTenantContext } from "../../../lib/tenant";

const CONFIG_KEY = "community_creation_form:v1";

export async function GET() {
  const user = await getSessionUser();
  if (!user || !user.ativo) {
    return Response.json({ error: "Faça login para continuar." }, { status: 401 });
  }
  const row = await getD1()
    .prepare("SELECT valor FROM configuracoes WHERE chave = ? LIMIT 1")
    .bind(CONFIG_KEY)
    .first<{ valor: string }>();
  let source: unknown = DEFAULT_COMMUNITY_CREATION_FIELDS;
  try {
    if (row?.valor) source = JSON.parse(row.valor);
  } catch {
    source = DEFAULT_COMMUNITY_CREATION_FIELDS;
  }
  return Response.json(
    {
      fields: parseCommunityCreationFields(source),
      canEdit: user.system_owner === true,
      coreFields: [
        "Nome público",
        "Cidade e estado",
        "Descrição",
        "E-mail institucional",
        "E-mail do pastor responsável",
      ],
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function PATCH(request: Request) {
  const user = await getSessionUser();
  if (!user || !user.ativo) {
    return Response.json({ error: "Faça login para continuar." }, { status: 401 });
  }
  if (!user.system_owner) {
    return Response.json(
      { error: "Somente o proprietário pode configurar esta ficha." },
      { status: 403 },
    );
  }
  const payload = (await request.json()) as Record<string, unknown>;
  const fields = parseCommunityCreationFields(payload.fields);
  if (!fields.length) {
    return Response.json(
      { error: "Mantenha ao menos um campo adicional na ficha." },
      { status: 400 },
    );
  }
  const db = getD1();
  await db
    .prepare(
      `INSERT INTO configuracoes (chave, valor, atualizado_por, atualizado_em)
       VALUES (?, ?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor,
         atualizado_por = excluded.atualizado_por,
         atualizado_em = CURRENT_TIMESTAMP`,
    )
    .bind(CONFIG_KEY, JSON.stringify(fields), user.email)
    .run();
  const tenant = await getActiveTenantContext(user);
  if (tenant.context) {
    await recordTenantAudit(
      db,
      tenant.context,
      user.id,
      "FICHA_CRIACAO_COMUNIDADE_ATUALIZADA",
      "SUCESSO",
      { totalCampos: fields.length },
    );
  }
  return Response.json({ fields });
}
