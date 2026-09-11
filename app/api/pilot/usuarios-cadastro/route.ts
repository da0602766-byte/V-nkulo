import { getD1 } from "../../../../db";
import { requireTenantPermission } from "../../../lib/tenant";
import { recordTenantAudit } from "../../../lib/tenant-audit";

type SignupAccountRow = {
  id: number;
  nome: string;
  email: string;
  telefone: string | null;
  cadastro_dados: string;
  ativo: number;
  criado_em: string;
};

export async function GET() {
  const access = await requireTenantPermission("platform.admin.view");
  if ("error" in access) return access.error;

  const rows = await getD1()
    .prepare(
      `SELECT id, nome, email, telefone, cadastro_dados, ativo, criado_em
       FROM usuarios
       ORDER BY id DESC
       LIMIT 50`,
    )
    .all<SignupAccountRow>();

  return Response.json({
    accounts: (rows.results || []).map((row) => ({
      id: row.id,
      nome: row.nome,
      email: row.email,
      telefone: row.telefone,
      ativo: Boolean(row.ativo),
      criadoEm: row.criado_em,
      dados: parseSignupData(row.cadastro_dados),
    })),
    privacy:
      "Senhas, hashes, tokens e sessões nunca são retornados por esta rota.",
  });
}

export async function DELETE(request: Request) {
  const access = await requireTenantPermission("platform.admin.view");
  if ("error" in access) return access.error;
  if (!access.user.system_owner) {
    return Response.json({ error: "Somente o proprietário pode excluir uma ficha global." }, { status: 403 });
  }
  const payload = await request.json().catch(() => ({})) as Record<string, unknown>;
  const userId = Number(payload.userId || 0);
  if (!Number.isInteger(userId) || userId <= 0 || userId === access.user.id) {
    return Response.json({ error: "Ficha inválida ou protegida." }, { status: 400 });
  }
  const db = getD1();
  const result = await db.prepare(
    `UPDATE usuarios SET cadastro_dados = '{}', atualizado_em = CURRENT_TIMESTAMP WHERE id = ?`,
  ).bind(userId).run();
  if (!result.meta.changes) return Response.json({ error: "Conta não encontrada." }, { status: 404 });
  await recordTenantAudit(db, access.context, access.user.id, "FICHA_CADASTRO_EXCLUIDA", "SUCESSO", { usuarioId: userId });
  return Response.json({ ok: true });
}

function parseSignupData(value: string) {
  try {
    const parsed = JSON.parse(value) as Record<
      string,
      { label?: unknown; value?: unknown }
    >;
    return Object.entries(parsed)
      .slice(0, 12)
      .map(([id, item]) => ({
        id,
        label: String(item?.label || id).slice(0, 70),
        value: String(item?.value || "").slice(0, 500),
      }))
      .filter((item) => item.value);
  } catch {
    return [];
  }
}
