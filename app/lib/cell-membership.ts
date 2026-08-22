function parseMembers(value?: string | null) {
  try {
    const parsed = value ? JSON.parse(value) : [];
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch { return []; }
}

async function updateMembers(db: D1Database, cellId: number, updater: (members: string[]) => string[]) {
  const cell = await db.prepare("SELECT membros FROM celulas WHERE id = ?").bind(cellId).first<{ membros: string }>();
  if (!cell) return;
  const next = updater(parseMembers(cell.membros));
  await db.prepare("UPDATE celulas SET membros = ?, atualizado_em = CURRENT_TIMESTAMP WHERE id = ?")
    .bind(JSON.stringify([...new Set(next.filter(Boolean))]), cellId).run();
}

export async function syncVisitorCell(db: D1Database, previous: { cellId?: number | null; name?: string | null }, next: { cellId?: number | null; name?: string | null }) {
  if (previous.cellId && previous.name) {
    await updateMembers(db, previous.cellId, (members) => members.filter((name) => name.toLocaleLowerCase("pt-BR") !== previous.name!.toLocaleLowerCase("pt-BR")));
  }
  if (next.cellId && next.name) {
    await updateMembers(db, next.cellId, (members) => [...members, next.name!]);
  }
}
