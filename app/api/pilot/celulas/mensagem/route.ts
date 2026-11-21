import { getD1 } from "../../../../../db";
import { requireTenantPermission } from "../../../../lib/tenant";

// Caixa de destaque no topo da Participação (o "Mateus 18:20" do design
// aprovado). Fica editável pela liderança que gerencia células, exatamente
// como o tema da comunidade em community-theme-storage.ts: reaproveita a
// tabela `configuracoes` (chave/valor) com uma chave por comunidade, sem
// exigir migração nova.
const DEFAULT_MESSAGE = {
  titulo: "Mateus 18:20",
  mensagem:
    "Porque onde dois ou três estiverem reunidos em meu nome, ali estou eu no meio deles.",
};

type StoredMessage = { titulo?: unknown; mensagem?: unknown };

function messageKey(comunidadeId: number) {
  return `cell_highlight_message:${comunidadeId}`;
}

export async function GET() {
  const access = await requireTenantPermission("cells.view");
  if ("error" in access) return access.error;
  const row = await getD1()
    .prepare("SELECT valor, atualizado_em FROM configuracoes WHERE chave = ? LIMIT 1")
    .bind(messageKey(access.context.comunidadeId))
    .first<{ valor: string; atualizado_em: string }>();
  const stored = parseStoredMessage(row?.valor);
  return Response.json({
    titulo: stored?.titulo || DEFAULT_MESSAGE.titulo,
    mensagem: stored?.mensagem || DEFAULT_MESSAGE.mensagem,
    atualizadoEm: row?.atualizado_em || null,
    podeEditar: access.context.permissions.includes("cells.manage"),
  }, { headers: { "Cache-Control": "no-store" } });
}

export async function PUT(request: Request) {
  const access = await requireTenantPermission("cells.manage");
  if ("error" in access) return access.error;
  const payload = ((await request.json().catch(() => null)) ?? {}) as Record<string, unknown>;
  const titulo = String(payload.titulo || "").trim().slice(0, 80);
  const mensagem = String(payload.mensagem || "").trim().slice(0, 400);
  if (titulo.length < 2 || mensagem.length < 2) {
    return Response.json(
      { error: "Informe um título e uma mensagem para o destaque." },
      { status: 400 },
    );
  }
  await getD1()
    .prepare(
      `INSERT INTO configuracoes (chave, valor, atualizado_por, atualizado_em)
       VALUES (?, ?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor,
         atualizado_por = excluded.atualizado_por, atualizado_em = CURRENT_TIMESTAMP`,
    )
    .bind(messageKey(access.context.comunidadeId), JSON.stringify({ titulo, mensagem }), access.user.email)
    .run();
  return Response.json({ titulo, mensagem });
}

function parseStoredMessage(value?: string): StoredMessage | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as StoredMessage;
    return {
      titulo: typeof parsed.titulo === "string" ? parsed.titulo : undefined,
      mensagem: typeof parsed.mensagem === "string" ? parsed.mensagem : undefined,
    };
  } catch {
    return null;
  }
}
