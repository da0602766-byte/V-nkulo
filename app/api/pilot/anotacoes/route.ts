import { getD1 } from "../../../../db";
import { recordTenantAudit } from "../../../lib/tenant-audit";
import { requireTenantPermission } from "../../../lib/tenant";

const COLORS = new Set(["amarelo", "rosa", "azul", "verde"]);
const MAX_NOTES = 80;

type ChecklistItem = {
  id: string;
  texto: string;
  concluido: boolean;
};

type CareNote = {
  id: string;
  titulo: string;
  texto: string;
  cor: string;
  visitanteId: number | null;
  visitanteNome: string;
  eventoId: number | null;
  eventoTitulo: string;
  checklist: ChecklistItem[];
  criadoEm: string;
  atualizadoEm: string;
};

type StoredNotes = { notes: CareNote[] };
type StoredRow = { configuracao: string };

function scopeFor(userId: number) {
  return `care-notes:user:${userId}`;
}

function cleanText(value: unknown, maxLength: number) {
  return String(value || "").trim().slice(0, maxLength);
}

function positiveId(value: unknown) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function parseStored(value?: string | null): StoredNotes {
  try {
    const parsed = JSON.parse(value || "{}") as { notes?: unknown };
    return { notes: Array.isArray(parsed.notes) ? parsed.notes.slice(0, MAX_NOTES) as CareNote[] : [] };
  } catch {
    return { notes: [] };
  }
}

function normalizeChecklist(value: unknown): ChecklistItem[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 16).flatMap((item, index) => {
    if (!item || typeof item !== "object") return [];
    const row = item as Record<string, unknown>;
    const texto = cleanText(row.texto, 180);
    if (!texto) return [];
    return [{
      id: cleanText(row.id, 80) || `item-${index}-${crypto.randomUUID()}`,
      texto,
      concluido: Boolean(row.concluido),
    }];
  });
}

function normalizeNote(value: unknown, previous?: CareNote): CareNote | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const titulo = cleanText(row.titulo, 100);
  const texto = cleanText(row.texto, 1200);
  if (!titulo && !texto) return null;
  const now = new Date().toISOString();
  const cor = cleanText(row.cor, 20);
  return {
    id: previous?.id || cleanText(row.id, 80) || crypto.randomUUID(),
    titulo: titulo || "Anotação de cuidado",
    texto,
    cor: COLORS.has(cor) ? cor : "amarelo",
    visitanteId: positiveId(row.visitanteId),
    visitanteNome: cleanText(row.visitanteNome, 120),
    eventoId: positiveId(row.eventoId),
    eventoTitulo: cleanText(row.eventoTitulo, 140),
    checklist: normalizeChecklist(row.checklist),
    criadoEm: previous?.criadoEm || now,
    atualizadoEm: now,
  };
}

async function readNotes(communityId: number, userId: number) {
  const row = await getD1().prepare(
    `SELECT configuracao FROM layouts_interface
     WHERE comunidade_id = ? AND escopo = ? LIMIT 1`,
  ).bind(communityId, scopeFor(userId)).first<StoredRow>();
  return parseStored(row?.configuracao);
}

async function saveNotes(communityId: number, userId: number, notes: CareNote[]) {
  await getD1().prepare(
    `INSERT INTO layouts_interface
     (comunidade_id, usuario_id, escopo, tipo, nome, configuracao, atualizado_por)
     VALUES (?, ?, ?, 'PESSOAL', 'Post-its de cuidado', ?, ?)
     ON CONFLICT(comunidade_id, escopo) DO UPDATE SET
       configuracao = excluded.configuracao,
       versao = layouts_interface.versao + 1,
       atualizado_por = excluded.atualizado_por,
       atualizado_em = CURRENT_TIMESTAMP`,
  ).bind(
    communityId,
    userId,
    scopeFor(userId),
    JSON.stringify({ notes: notes.slice(0, MAX_NOTES) }),
    userId,
  ).run();
}

export async function GET() {
  const access = await requireTenantPermission("dashboard.view");
  if ("error" in access) return access.error;
  const db = getD1();
  const [stored, events, visitors] = await Promise.all([
    readNotes(access.context.comunidadeId, access.user.id),
    db.prepare(
      `SELECT id, titulo, inicia_em
       FROM eventos_comunidade
       WHERE comunidade_id = ? AND status != 'CANCELADO'
         AND datetime(inicia_em) >= datetime('now', '-1 day')
       ORDER BY datetime(inicia_em), id LIMIT 40`,
    ).bind(access.context.comunidadeId).all<{ id: number; titulo: string; inicia_em: string }>(),
    db.prepare(
      `SELECT id, nome_completo
       FROM visitantes
       WHERE comunidade_id = ? AND ativo = 1 AND escopo_confirmado = 1
       ORDER BY nome_completo LIMIT 120`,
    ).bind(access.context.comunidadeId).all<{ id: number; nome_completo: string }>(),
  ]);
  return Response.json({
    anotacoes: stored.notes,
    eventos: events.results,
    visitantes: visitors.results,
  });
}

export async function POST(request: Request) {
  const access = await requireTenantPermission("dashboard.view");
  if ("error" in access) return access.error;
  const note = normalizeNote(await request.json().catch(() => null));
  if (!note) return Response.json({ error: "Escreva um título ou uma anotação." }, { status: 400 });
  const stored = await readNotes(access.context.comunidadeId, access.user.id);
  const notes = [note, ...stored.notes.filter((item) => item.id !== note.id)].slice(0, MAX_NOTES);
  await saveNotes(access.context.comunidadeId, access.user.id, notes);
  await recordTenantAudit(getD1(), access.context, access.user.id, "ANOTACAO_CUIDADO_CRIADA", "SUCESSO", { noteId: note.id });
  return Response.json({ anotacao: note });
}

export async function PATCH(request: Request) {
  const access = await requireTenantPermission("dashboard.view");
  if ("error" in access) return access.error;
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const id = cleanText(body?.id, 80);
  if (!id) return Response.json({ error: "Anotação inválida." }, { status: 400 });
  const stored = await readNotes(access.context.comunidadeId, access.user.id);
  const previous = stored.notes.find((item) => item.id === id);
  if (!previous) return Response.json({ error: "Anotação não encontrada." }, { status: 404 });
  const note = normalizeNote({ ...previous, ...body, id }, previous);
  if (!note) return Response.json({ error: "A anotação não pode ficar vazia." }, { status: 400 });
  const notes = stored.notes.map((item) => item.id === id ? note : item);
  await saveNotes(access.context.comunidadeId, access.user.id, notes);
  return Response.json({ anotacao: note });
}

export async function DELETE(request: Request) {
  const access = await requireTenantPermission("dashboard.view");
  if ("error" in access) return access.error;
  const id = cleanText(new URL(request.url).searchParams.get("id"), 80);
  if (!id) return Response.json({ error: "Anotação inválida." }, { status: 400 });
  const stored = await readNotes(access.context.comunidadeId, access.user.id);
  await saveNotes(access.context.comunidadeId, access.user.id, stored.notes.filter((item) => item.id !== id));
  await recordTenantAudit(getD1(), access.context, access.user.id, "ANOTACAO_CUIDADO_REMOVIDA", "SUCESSO", { noteId: id });
  return Response.json({ ok: true });
}
