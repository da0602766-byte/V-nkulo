import { getD1 } from "../../../db";
import { requireApiPermission } from "../../lib/access";
import { ensureTodayBirthdayNotices } from "../../lib/birthdays";
import { enrichNotices } from "../../lib/notice-interactions";
import { normalizeNoticeImage } from "../../lib/notice-image";
import { createSystemNotification } from "../../lib/system-notifications";

export async function GET() {
  const access = await requireApiPermission();
  if (access.error) return access.error;
  await ensureTodayBirthdayNotices();
  const db = getD1();
  const result = await db
    .prepare(
      "SELECT * FROM avisos WHERE publicado = 1 ORDER BY publicado_em DESC LIMIT 50",
    )
    .all<Record<string, unknown>>();
  return Response.json({
    avisos: await enrichNotices(db, result.results, access.user!),
  });
}

export async function POST(request: Request) {
  const access = await requireApiPermission("AVISOS_PUBLICAR");
  if (access.error) return access.error;
  const payload = (await request.json()) as {
    titulo?: string;
    resumo?: string;
    conteudo?: string;
    tipo?: string;
    prioridade?: string;
    imagem?: string;
  };
  const titulo = payload.titulo?.trim() ?? "";
  const resumo = payload.resumo?.trim() ?? "";
  if (!titulo || !resumo)
    return Response.json(
      { error: "Título e resumo são obrigatórios." },
      { status: 400 },
    );
  const image = normalizeNoticeImage(payload.imagem);
  if (image.error)
    return Response.json({ error: image.error }, { status: 400 });
  const db = getD1();
  const result = await db
    .prepare(
      "INSERT INTO avisos (titulo, resumo, conteudo, imagem, tipo, prioridade, publicado, publicado_por) VALUES (?, ?, ?, ?, ?, ?, 1, ?)",
    )
    .bind(
      titulo,
      resumo,
      payload.conteudo || null,
      image.image,
      payload.tipo || "AVISO",
      payload.prioridade || "NORMAL",
      access.user!.email,
    )
    .run();
  await createSystemNotification(db, {
    tipo: payload.prioridade === "URGENTE" ? "IMPORTANTE" : "NOVO",
    titulo: "Nova publicação no Menu Principal",
    mensagem: `${titulo}: ${resumo}`,
    area: "MENU",
    entidadeId: Number(result.meta.last_row_id),
    criadoPor: access.user!.email,
  });
  return Response.json({ id: result.meta.last_row_id }, { status: 201 });
}
