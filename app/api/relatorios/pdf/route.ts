import { getD1 } from "../../../../db";
import { requireApiPermission } from "../../../lib/access";
import { pdfResponse } from "../../../lib/pdf";
export async function GET(request: Request) {
  const access = await requireApiPermission("RELATORIOS_VER");
  if (access.error) return access.error;
  const params = new URL(request.url).searchParams;
  const periodo = params.get("periodo") ?? "mes";
  const where = periodo === "semana" ? "data_entrada >= date('now', '-6 days')" : periodo === "ano" ? "strftime('%Y', data_entrada) = strftime('%Y', 'now')" : "data_entrada >= date('now', 'start of month')";
  const db = getD1();
  const total = await db.prepare(`SELECT COUNT(*) AS total FROM visitantes WHERE ativo = 1 AND ${where}`).first<{ total: number }>();
  const rows = await db.prepare(`SELECT nome_completo, status, data_entrada FROM visitantes WHERE ativo = 1 AND ${where} ORDER BY data_entrada DESC LIMIT 80`).all<{ nome_completo: string; status: string; data_entrada: string }>();
  const label = periodo === "semana" ? "Semanal" : periodo === "ano" ? "Anual" : "Mensal";
  const title = (params.get("titulo") || `ADOTE - Relatorio ${label}`).slice(0, 100);
  const note = (params.get("nota") || "").slice(0, 500);
  return pdfResponse(`relatorio-${periodo}.pdf`, title, [...(note ? [note, ""] : []), `Gerado em ${new Date().toLocaleDateString("pt-BR")}`, `Total de visitantes: ${total?.total ?? 0}`, "", "Visitantes do periodo:", ...rows.results.map((row: { nome_completo: string; status: string; data_entrada: string }) => `${row.data_entrada} - ${row.nome_completo} (${row.status})`)], params.get("download") === "1");
}
