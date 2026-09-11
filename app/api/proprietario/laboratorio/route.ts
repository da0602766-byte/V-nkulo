import { getD1 } from "../../../../db";
import { getSessionUser } from "../../../lib/local-auth";
import { EMPTY_LAB_DOCUMENT, laboratoryTemplate, parseLaboratoryDocument } from "../../../lib/owner-laboratory";

type Row = { id: number; nome: string; descricao: string; status: string; dispositivo_principal: string; versao: number; criado_em: string; atualizado_em: string; autor_nome: string; documento: string; css: string };
const clean = (value: unknown, max: number) => String(value ?? "").trim().slice(0, max);
async function owner() { const user = await getSessionUser(); if (!user) return { error: Response.json({ error: "Faça login para continuar." }, { status: 401 }) } as const; if (!user.ativo || !user.system_owner) return { error: Response.json({ error: "Esta área é exclusiva do proprietário do sistema." }, { status: 403 }) } as const; return { user } as const; }
function id(value: unknown) { const parsed = Number(value); return Number.isInteger(parsed) && parsed > 0 ? parsed : 0; }
function document(value: unknown, css?: unknown) { const parsed = parseLaboratoryDocument(value); return { ...parsed, css: css === undefined ? parsed.css : parseLaboratoryDocument({ ...parsed, css }).css }; }
async function audit(db: ReturnType<typeof getD1>, userId: number, event: string, metadata: Record<string, unknown>) { await db.prepare("INSERT INTO auditoria_piloto (comunidade_id, usuario_id, evento, resultado, metadados) VALUES (NULL, ?, ?, 'SUCESSO', ?)").bind(userId, event, JSON.stringify(metadata)).run(); }
function view(row: Row) { let parsed = EMPTY_LAB_DOCUMENT; try { parsed = document(JSON.parse(row.documento), row.css); } catch {} return { ...row, document: parsed }; }

export async function GET(request: Request) {
  const access = await owner(); if ("error" in access) return access.error;
  const status = new URL(request.url).searchParams.get("status") || "ATIVO";
  const db = getD1();
  if (status === "templates") return Response.json({ templates: ["Dashboard", "Página administrativa", "Lista", "Tabela", "Página de membro", "Formulário", "Relatório", "Página de configurações", "Painel operacional"] });
  const rows = await db.prepare(`SELECT e.*, u.nome AS autor_nome FROM laboratorio_experimentos e JOIN usuarios u ON u.id = e.autor_id WHERE e.status = ? ORDER BY e.atualizado_em DESC, e.id DESC LIMIT 100`).bind(status === "ARQUIVADO" ? "ARQUIVADO" : "ATIVO").all<Row>();
  return Response.json({ experiments: rows.results.map(view) }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const access = await owner(); if ("error" in access) return access.error;
  let body: Record<string, unknown>; try { body = await request.json() as Record<string, unknown>; } catch { return Response.json({ error: "Conteúdo inválido." }, { status: 400 }); }
  const nome = clean(body.nome, 120); if (nome.length < 2) return Response.json({ error: "Informe um nome para o experimento." }, { status: 400 });
  const doc = body.template ? laboratoryTemplate(clean(body.template, 100)) : document(body.document);
  const db = getD1(); const result = await db.prepare("INSERT INTO laboratorio_experimentos (autor_id, nome, descricao, status, dispositivo_principal, documento, css) VALUES (?, ?, ?, 'ATIVO', ?, ?, ?)").bind(access.user.id, nome, clean(body.descricao, 500), ["MOBILE_360", "MOBILE_390", "MOBILE_412", "TABLET", "DESKTOP", "WIDE"].includes(String(body.dispositivo)) ? body.dispositivo : "DESKTOP", JSON.stringify(doc), doc.css).run();
  await audit(db, access.user.id, "LABORATORIO_EXPERIMENTO_CRIADO", { experimentId: result.meta.last_row_id });
  return Response.json({ ok: true, id: result.meta.last_row_id }, { status: 201 });
}

export async function PATCH(request: Request) {
  const access = await owner(); if ("error" in access) return access.error;
  let body: Record<string, unknown>; try { body = await request.json() as Record<string, unknown>; } catch { return Response.json({ error: "Conteúdo inválido." }, { status: 400 }); }
  const experimentId = id(body.id); if (!experimentId) return Response.json({ error: "Experimento inválido." }, { status: 400 }); const db = getD1(); const current = await db.prepare("SELECT * FROM laboratorio_experimentos WHERE id = ? LIMIT 1").bind(experimentId).first<Row>(); if (!current) return Response.json({ error: "Experimento não encontrado." }, { status: 404 });
  const action = clean(body.action, 30).toUpperCase();
  if (action === "DELETE") { await db.prepare("DELETE FROM laboratorio_experimentos WHERE id = ?").bind(experimentId).run(); await audit(db, access.user.id, "LABORATORIO_EXPERIMENTO_EXCLUIDO", { experimentId }); return Response.json({ ok: true }); }
  if (action === "ARCHIVE" || action === "RESTORE") { const status = action === "ARCHIVE" ? "ARQUIVADO" : "ATIVO"; await db.prepare("UPDATE laboratorio_experimentos SET status = ?, atualizado_em = CURRENT_TIMESTAMP WHERE id = ?").bind(status, experimentId).run(); await audit(db, access.user.id, `LABORATORIO_EXPERIMENTO_${action === "ARCHIVE" ? "ARQUIVADO" : "RESTAURADO"}`, { experimentId }); return Response.json({ ok: true }); }
  if (action === "DUPLICATE") { const result = await db.prepare("INSERT INTO laboratorio_experimentos (autor_id, nome, descricao, status, dispositivo_principal, documento, css) VALUES (?, ?, ?, 'ATIVO', ?, ?, ?)").bind(access.user.id, `Cópia de ${current.nome}`.slice(0, 120), current.descricao, current.dispositivo_principal, current.documento, current.css).run(); await audit(db, access.user.id, "LABORATORIO_EXPERIMENTO_DUPLICADO", { experimentId, duplicateId: result.meta.last_row_id }); return Response.json({ ok: true, id: result.meta.last_row_id }); }
  if (action === "CHECKPOINT" || action === "RESTORE_VERSION") {
    if (action === "CHECKPOINT") { await db.prepare("INSERT INTO laboratorio_versoes (experimento_id, autor_id, rotulo, documento, css) VALUES (?, ?, ?, ?, ?)").bind(experimentId, access.user.id, clean(body.rotulo, 120) || `Versão ${current.versao}`, current.documento, current.css).run(); return Response.json({ ok: true }); }
    const versionId = id(body.versionId); const version = await db.prepare("SELECT documento, css FROM laboratorio_versoes WHERE id = ? AND experimento_id = ? LIMIT 1").bind(versionId, experimentId).first<{ documento: string; css: string }>(); if (!version) return Response.json({ error: "Versão não encontrada." }, { status: 404 }); await db.prepare("UPDATE laboratorio_experimentos SET documento = ?, css = ?, versao = versao + 1, atualizado_em = CURRENT_TIMESTAMP WHERE id = ?").bind(version.documento, version.css, experimentId).run(); await audit(db, access.user.id, "LABORATORIO_VERSAO_RESTAURADA", { experimentId, versionId }); return Response.json({ ok: true });
  }
  const doc = document(body.document, body.css); await db.prepare("UPDATE laboratorio_experimentos SET nome = ?, descricao = ?, dispositivo_principal = ?, documento = ?, css = ?, versao = versao + 1, atualizado_em = CURRENT_TIMESTAMP WHERE id = ?").bind(clean(body.nome || current.nome, 120), clean(body.descricao ?? current.descricao, 500), ["MOBILE_360", "MOBILE_390", "MOBILE_412", "TABLET", "DESKTOP", "WIDE"].includes(String(body.dispositivo)) ? body.dispositivo : current.dispositivo_principal, JSON.stringify(doc), doc.css, experimentId).run(); await audit(db, access.user.id, "LABORATORIO_EXPERIMENTO_SALVO", { experimentId }); return Response.json({ ok: true });
}
