import { googleAuthorizationResponse } from '../../../../lib/google-authorization-response';
import { getD1 } from "../../../../../db";
import { visitorDriveConfig } from '../../../../lib/visitor-drive-store';
import { requireTenantPermission } from "../../../../lib/tenant";
import { recordTenantAudit } from "../../../../lib/tenant-audit";
import { googleIntegrationAvailable } from "../../../../lib/google-integration";
import { assertSheetPrivate, ensureVisitorSheet, hasVisitorSheetAuthorization, spreadsheetIdFromUrl, syncVisitorSheet, visitorSheetToken, VisitorSheetError, type VisitorSheetConfig } from "../../../../lib/visitor-sheets";

async function accessForSheets() {
  const access = await requireTenantPermission("visitor.categories.manage");
  if ("error" in access) return access;
  if (access.context.temporaryAccess || (!access.context.isOwner && !access.context.isCommunityOwner && !["PASTOR", "ADMIN_COMUNIDADE", "SUPERADMIN"].includes(access.context.papel))) return { error: Response.json({ error: "A conexão da planilha exige um gestor permanente da comunidade." }, { status: 403 }) } as const;
  return access;
}

export async function GET() {
  const access = await accessForSheets();
  if ("error" in access) return access.error;
  const config = await getD1().prepare("SELECT spreadsheet_id, sheet_id, habilitada, versao, versao_sincronizada, linhas, sincronizado_em, ultimo_erro FROM visitante_planilha WHERE comunidade_id = ?").bind(access.context.comunidadeId).first();
  const google = await hasVisitorSheetAuthorization(access.user.id);
  return Response.json({ config, google: { ...google, available: googleIntegrationAvailable() }, communityId: access.context.comunidadeId, userId: access.user.id }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const access = await accessForSheets();
  if ("error" in access) return access.error;
  if(await visitorDriveConfig(access.context.comunidadeId))return Response.json({error:'Os cadastros agora usam o armazenamento Drive. A antiga cópia em Planilhas está desativada.'},{status:409});
  const body = ((await request.json().catch(() => null)) ?? {}) as { action?: string; url?: string; channel?: string; pairing?: string };
  const db = getD1();
  const communityId = access.context.comunidadeId;
  const current = await db.prepare("SELECT * FROM visitante_planilha WHERE comunidade_id = ?").bind(communityId).first<VisitorSheetConfig>();
  if (current && current.lock_ate > Date.now()) return Response.json({ error: "Uma sincronização está em andamento. Aguarde alguns segundos." }, { status: 409 });
  try {
    if (body.action === "authorize") {
      return googleAuthorizationResponse(request, { purpose: "drive", visitorSheets: true, userId: access.user.id, returnTo: "/painel/visitantes?sheetSetup=authorized" }, body);
    }
    if (body.action === "pause") {
      await db.prepare("UPDATE visitante_planilha SET habilitada = 0 WHERE comunidade_id = ? AND lock_ate < ?").bind(communityId, Date.now()).run();
      await recordTenantAudit(db, access.context, access.user.id, "VISITANTES_PLANILHA_PAUSADA", "SUCESSO", {});
      return Response.json({ ok: true });
    }
    if (body.action === "sync") {
      if (!current?.habilitada) return Response.json({ error: "Conecte a planilha antes de sincronizar." }, { status: 409 });
      await syncVisitorSheet(db, communityId);
      return GET();
    }
    if (body.action !== "connect") return Response.json({ error: "Ação inválida." }, { status: 400 });
    const id = spreadsheetIdFromUrl(String(body.url || ""));
    if (!id) return Response.json({ error: "Informe um link HTTPS válido de uma Planilha Google." }, { status: 400 });
    if (!(await hasVisitorSheetAuthorization(access.user.id)).authorized) return Response.json({ authorizationRequired: true });
    const replacing = Boolean(current && current.spreadsheet_id !== id);
    if (replacing && current?.habilitada) return Response.json({ error: "Pause a sincronização antes de conectar outra planilha. A cópia anterior continuará no Google Drive." }, { status: 409 });
    const token = await visitorSheetToken(access.user.id);
    await assertSheetPrivate(token, id);
    const sheetId = !replacing && current ? current.sheet_id : Math.floor(Math.random() * 2000000000) + 1;
    // Persist the tab identity before creating it, so an uncertain Google response is recoverable.
    await db.prepare("INSERT INTO visitante_planilha (comunidade_id, usuario_id, spreadsheet_id, sheet_id) VALUES (?, ?, ?, ?) ON CONFLICT(comunidade_id) DO NOTHING").bind(communityId, access.user.id, id, sheetId).run();
    const lease = crypto.randomUUID();
    const locked = await db.prepare("UPDATE visitante_planilha SET lock_token = ?, lock_ate = ? WHERE comunidade_id = ? AND lock_ate < ?").bind(lease, Date.now() + 120000, communityId, Date.now()).run();
    if (!locked.meta.changes) return Response.json({ error: "Conexão em andamento. Aguarde alguns segundos." }, { status: 409 });
    try {
      if (replacing) await db.prepare("UPDATE visitante_planilha SET spreadsheet_id = ?, sheet_id = ?, linhas = 0, versao_sincronizada = 0, sincronizado_em = NULL WHERE comunidade_id = ? AND habilitada = 0 AND lock_token = ?").bind(id, sheetId, communityId, lease).run();
      const config = await db.prepare("SELECT * FROM visitante_planilha WHERE comunidade_id = ?").bind(communityId).first<VisitorSheetConfig>();
      if (!config || config.spreadsheet_id !== id) throw new Error("O vínculo foi alterado. Atualize a página.");
      await ensureVisitorSheet(token, config);
      await db.prepare("UPDATE visitante_planilha SET usuario_id = ?, habilitada = 1, versao = versao + 1, tentar_apos = 0, ultimo_erro = NULL WHERE comunidade_id = ? AND lock_token = ?").bind(access.user.id, communityId, lease).run();
    } finally {
      await db.prepare("UPDATE visitante_planilha SET lock_token = NULL, lock_ate = 0 WHERE comunidade_id = ? AND lock_token = ?").bind(communityId, lease).run();
    }
    await recordTenantAudit(db, access.context, access.user.id, "VISITANTES_PLANILHA_CONECTADA", "SUCESSO", {});
    await syncVisitorSheet(db, communityId);
    return GET();
  } catch (error) {
    const message = error instanceof Error && !/UNIQUE|token|secret/i.test(error.message) ? error.message : "Não foi possível conectar. Verifique se esta planilha já pertence a outra comunidade.";
    const id = spreadsheetIdFromUrl(String(body.url || ""));
    if (body.action === "connect" && id) await db.prepare("UPDATE visitante_planilha SET ultimo_erro = ? WHERE comunidade_id = ? AND spreadsheet_id = ? AND lock_ate < ?").bind(message, communityId, id, Date.now()).run();
    return Response.json({ error: message, code: error instanceof VisitorSheetError ? error.code : "CONNECTION_FAILED", helpUrl: error instanceof VisitorSheetError ? error.helpUrl : undefined }, { status: 400 });
  }
}
