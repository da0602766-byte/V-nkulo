import { getD1 } from "../../../db";
import { requireApiPermission } from "../../lib/access";
import { syncVisitorCell } from "../../lib/cell-membership";
import { createSystemNotification } from "../../lib/system-notifications";

const BATISMO = new Set(["SIM", "NAO", "NAO_INFORMADO"]);
const STATUS = new Set(["NOVO", "EM_CONTATO", "EM_ACOMPANHAMENTO", "INTEGRADO"]);

export async function GET(request: Request) {
  const access = await requireApiPermission("VISITANTES_VER");
  if (access.error) return access.error;
  const search = new URL(request.url).searchParams.get("busca")?.trim() ?? "";
  const db = getD1();
  const result = await db.prepare(
    "SELECT * FROM visitantes WHERE ativo = 1 AND (nome_completo LIKE ? OR telefone LIKE ? OR email LIKE ?) ORDER BY criado_em DESC, id DESC LIMIT 100",
  ).bind(`%${search}%`, `%${search}%`, `%${search}%`).all();
  return Response.json({ visitantes: result.results });
}

export async function POST(request: Request) {
  const access = await requireApiPermission("VISITANTES_CRIAR");
  if (access.error) return access.error;
  const payload = (await request.json()) as Record<string, string | boolean | null>;
  const nome = String(payload.nomeCompleto ?? "").trim();
  const batizado = String(payload.batizado ?? "NAO_INFORMADO").toUpperCase();
  const status = String(payload.status ?? "NOVO").toUpperCase();
  const dataEntrada = String(payload.dataEntrada ?? new Date().toISOString().slice(0, 10));
  if (!nome) return Response.json({ error: "Nome completo é obrigatório." }, { status: 400 });
  if (!BATISMO.has(batizado)) return Response.json({ error: "Situação de batismo inválida." }, { status: 400 });
  if (!STATUS.has(status)) return Response.json({ error: "Status inválido." }, { status: 400 });

  const db = getD1();
  const cellId = Number(payload.celulaId || 0) || null;
  const cell = cellId ? await db.prepare("SELECT id, nome FROM celulas WHERE id = ?").bind(cellId).first<{ id: number; nome: string }>() : null;
  if (cellId && !cell) return Response.json({ error: "Selecione uma célula já cadastrada." }, { status: 400 });

  const result = await db.prepare(
    `INSERT INTO visitantes (
      nome_completo, data_nascimento, telefone, email, batizado, status, endereco,
      acompanhante, celula, celula_id, encontro_com_deus, curso_membros, ministerio,
      data_entrada, observacoes, criado_por, ativo
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
  ).bind(
    nome,
    payload.dataNascimento || null,
    String(payload.telefone ?? "").trim() || null,
    String(payload.email ?? "").trim().toLowerCase() || null,
    batizado,
    status,
    String(payload.endereco ?? "").trim() || null,
    String(payload.acompanhante ?? "").trim() || null,
    cell?.nome || null,
    cell?.id || null,
    payload.encontroComDeus ? 1 : 0,
    payload.cursoMembros ? 1 : 0,
    String(payload.ministerio ?? "").trim() || null,
    dataEntrada,
    String(payload.observacoes ?? "").trim() || null,
    access.user!.email,
  ).run();
  await syncVisitorCell(db, {}, { cellId: cell?.id, name: nome });
  await createSystemNotification(db, {
    tipo: "NOVO",
    titulo: "Novo visitante no ADOTE",
    mensagem: `${nome} foi cadastrado no acompanhamento de visitantes.`,
    area: "VISITANTES",
    entidadeId: Number(result.meta.last_row_id),
    criadoPor: access.user!.email,
  });
  return Response.json({ id: result.meta.last_row_id }, { status: 201 });
}
