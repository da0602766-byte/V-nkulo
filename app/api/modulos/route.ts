import { getD1 } from "../../../db";
import { requireApiPermission } from "../../lib/access";
import { createSystemNotification } from "../../lib/system-notifications";

function slugify(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export async function GET() {
  const access = await requireApiPermission("MODULOS_PERSONALIZADOS_VER");
  if (access.error) return access.error;
  const db = getD1();
  const [result, records] = await Promise.all([
    db.prepare("SELECT * FROM ministerio_modulos WHERE ativo = 1 ORDER BY ordem, nome").all(),
    db.prepare("SELECT * FROM ministerio_registros ORDER BY criado_em DESC LIMIT 100").all(),
  ]);
  return Response.json({ modulos: result.results, registros: records.results });
}

export async function POST(request: Request) {
  const access = await requireApiPermission("MODULOS_GERENCIAR");
  if (access.error) return access.error;
  const payload = (await request.json()) as { nome?: string; descricao?: string; icone?: string; campos?: unknown[]; conteudo?: unknown[]; cor?: string; permissao?: string };
  if (hasEmbeddedMedia(payload.conteudo)) {
    return Response.json(
      { error: "As imagens precisam estar no Google Drive; o Vínkulo não guarda arquivos no banco." },
      { status: 400 },
    );
  }
  const nome = payload.nome?.trim() ?? "";
  const slug = slugify(nome);
  if (!nome || !slug) return Response.json({ error: "Informe um nome válido para a aba." }, { status: 400 });
  const db = getD1();
  const result = await db.prepare(
    "INSERT INTO ministerio_modulos (nome, slug, descricao, icone, permissao, campos, conteudo, cor, ativo, criado_por) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)",
  ).bind(nome, slug, payload.descricao || null, payload.icone || "◇", payload.permissao || "MODULOS_PERSONALIZADOS_VER", JSON.stringify(payload.campos ?? []), JSON.stringify(payload.conteudo ?? []), payload.cor || "#17877f", access.user!.email).run();
  await createSystemNotification(db, {
    tipo: "NOVO",
    titulo: "Nova área personalizada",
    mensagem: `A área ${nome} foi criada em Outras áreas.`,
    area: "MODULOS",
    entidadeId: Number(result.meta.last_row_id),
    criadoPor: access.user!.email,
  });
  return Response.json({ id: result.meta.last_row_id }, { status: 201 });
}

function hasEmbeddedMedia(value: unknown) {
  return /data:(?:image|audio|video|application)\//i.test(JSON.stringify(value ?? null));
}
