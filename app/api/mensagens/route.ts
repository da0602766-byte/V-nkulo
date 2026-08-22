import { getD1 } from "../../../db";
import { requireApiPermission } from "../../lib/access";
import { ACTIVE_NOW_SQL, type DisplayMessage } from "../../lib/display-control";
import { normalizeDisplayMessage } from "../../lib/display-message-input";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const adminView = url.searchParams.get("admin") === "1";
  const access = await requireApiPermission(
    adminView ? "SISTEMA_PERSONALIZAR" : undefined,
  );
  if (access.error) return access.error;

  const where = adminView
    ? ""
    : `WHERE ativo = 1
       AND (inicia_em IS NULL OR datetime(inicia_em) <= CURRENT_TIMESTAMP)
       AND (termina_em IS NULL OR datetime(termina_em) > CURRENT_TIMESTAMP)`;
  const rows = await getD1()
    .prepare(
      `SELECT *, ${ACTIVE_NOW_SQL} AS ativo_agora
       FROM mensagens_exibicao ${where}
       ORDER BY ativo_agora DESC,
                CASE tipo WHEN 'URGENTE' THEN 0 WHEN 'IMPORTANTE' THEN 1 ELSE 2 END,
                atualizado_em DESC`,
    )
    .all<DisplayMessage>();
  return Response.json({ mensagens: rows.results });
}

export async function POST(request: Request) {
  const access = await requireApiPermission("SISTEMA_PERSONALIZAR");
  if (access.error) return access.error;
  const normalized = normalizeDisplayMessage(await request.json());
  if (!normalized.value) {
    return Response.json({ error: normalized.error }, { status: 400 });
  }
  const value = normalized.value;
  const result = await getD1()
    .prepare(
      `INSERT INTO mensagens_exibicao
       (titulo, mensagem, tipo, areas, animacao, intervalo_segundos,
        inicia_em, termina_em, ativo, criado_por)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      value.titulo,
      value.mensagem,
      value.tipo,
      value.areas,
      value.animacao,
      value.intervaloSegundos,
      value.iniciaEm,
      value.terminaEm,
      value.ativo,
      access.user!.email,
    )
    .run();
  return Response.json({ id: result.meta.last_row_id }, { status: 201 });
}
