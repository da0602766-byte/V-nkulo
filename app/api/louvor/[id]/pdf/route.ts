import { getD1 } from "../../../../../db";
import { requireApiPermission } from "../../../../lib/access";
import { pdfResponse } from "../../../../lib/pdf";
type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: Context) {
  const access = await requireApiPermission("LOUVOR_VER");
  if (access.error) return access.error;
  const id = Number((await context.params).id);
  const row = await getD1().prepare("SELECT * FROM louvor_escalas WHERE id = ?").bind(id).first<{ titulo: string; data_culto: string; horario: string | null; local: string | null; musicas: string; integrantes: string; observacoes: string | null }>();
  if (!row) return Response.json({ error: "Escala não encontrada." }, { status: 404 });
  const songs = JSON.parse(row.musicas) as { titulo?: string; tonalidade?: string; vocal?: string }[];
  const people = JSON.parse(row.integrantes) as { nome?: string; funcao?: string }[];
  const params = new URL(request.url).searchParams;
  const title = (params.get("titulo") || `ADOTE - ${row.titulo}`).slice(0, 100);
  const note = (params.get("nota") || "").slice(0, 500);
  return pdfResponse(`escala-louvor-${id}.pdf`, title, [...(note ? [note, ""] : []), `Data: ${row.data_culto} ${row.horario ?? ""}`, `Local: ${row.local ?? ""}`, "", "REPERTORIO", ...songs.map((song, index) => `${index + 1}. ${song.titulo ?? "Musica"} | ${song.tonalidade ?? ""} | ${song.vocal ?? ""}`), "", "EQUIPE ESCALADA", ...people.map((person) => `${person.nome ?? "Pessoa"} - ${person.funcao ?? "Integrante"}`), ...(row.observacoes ? ["", `Observacoes: ${row.observacoes}`] : [])], params.get("download") === "1");
}
