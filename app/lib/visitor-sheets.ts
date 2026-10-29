import { getD1 } from "../../db";
import { getDriveAccessToken, getGoogleConnection } from "./google-integration";
import { visitorExportRows, mapVisitorExportRows } from "./visitor-export";
import { visitorCustomFields } from "./visitor-custom-fields";
import { visitorDriveConfig } from './visitor-drive-store';

export const VISITOR_SHEET_SCOPES = ["https://www.googleapis.com/auth/spreadsheets", "https://www.googleapis.com/auth/drive.metadata.readonly"];
export type VisitorSheetConfig = { comunidade_id: number; usuario_id: number; spreadsheet_id: string; sheet_id: number; habilitada: number; versao: number; versao_sincronizada: number; linhas: number; sincronizado_em: string | null; ultimo_erro: string | null; lock_ate: number };
const TITLE = "Vínkulo — Pessoas";

export class VisitorSheetError extends Error {
  constructor(message: string, public code: string, public helpUrl?: string) { super(message); }
}

export async function hasVisitorSheetAuthorization(userId: number) {
  const connection = await getGoogleConnection(userId);
  return { authorized: Boolean(connection?.refresh_token_ciphertext && !connection.revoked_at && VISITOR_SHEET_SCOPES.every(scope => connection.scopes.split(" ").includes(scope))), email: connection?.google_email || null };
}

export function spreadsheetIdFromUrl(value: string) {
  try { const url = new URL(value); return url.protocol === "https:" && url.hostname === "docs.google.com" ? url.pathname.match(/^\/spreadsheets\/d\/([\w-]{20,120})(?:\/|$)/)?.[1] || null : null; } catch { return null; }
}

export async function sheetGoogle<T = Record<string, unknown>>(token: string, url: string, body?: unknown) {
  const response = await fetch(url, { method: body ? "POST" : "GET", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(20000) });
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { error?: { details?: { reason?: string; metadata?: { consumer?: string } }[]; errors?: { reason?: string }[] } };
    const reasons = [...(body.error?.details || []), ...(body.error?.errors || [])].map(item => item.reason);
    if (reasons.some(reason => ["SERVICE_DISABLED", "accessNotConfigured"].includes(reason || ""))) {
      const service = url.includes("sheets.googleapis.com") ? "sheets.googleapis.com" : "drive.googleapis.com";
      const project = body.error?.details?.map(item => item.metadata?.consumer?.match(/^projects\/(\d+)$/)?.[1]).find(Boolean);
      throw new VisitorSheetError(`A API ${service === "sheets.googleapis.com" ? "Google Sheets" : "Google Drive"} está desativada no projeto Google do Vínkulo. O administrador da integração precisa ativá-la; depois, tente conectar novamente.`, "GOOGLE_API_DISABLED", `https://console.cloud.google.com/apis/library/${service}${project ? `?project=${project}` : ""}`);
    }
    if (response.status === 401 || reasons.some(reason => ["ACCESS_TOKEN_SCOPE_INSUFFICIENT", "insufficientPermissions"].includes(reason || ""))) throw new VisitorSheetError("A autorização do Google expirou ou não inclui Planilhas. Autorize novamente e permita os acessos solicitados.", "GOOGLE_AUTH_REQUIRED");
    if (response.status === 403) throw new VisitorSheetError("A conta Google conectada não pode editar esta planilha. No Google, compartilhe o arquivo com essa conta como Editor e verifique se a aba está protegida.", "GOOGLE_PERMISSION_DENIED");
    if (response.status === 404) throw new VisitorSheetError("Planilha não encontrada. Confira o link e compartilhe o arquivo com a conta Google conectada.", "SHEET_NOT_FOUND");
    throw new VisitorSheetError(response.status === 429 ? "O Google limitou as atualizações temporariamente. Aguarde um minuto e tente novamente." : "O Google está indisponível no momento. Seus cadastros continuam salvos; tente novamente.", "GOOGLE_UNAVAILABLE");
  }
  return response.json() as Promise<T>;
}

export async function visitorSheetToken(userId: number) {
  const connection = await getGoogleConnection(userId);
  if (!VISITOR_SHEET_SCOPES.every(scope => connection?.scopes.split(" ").includes(scope))) throw new Error("Autorize Planilhas Google antes de conectar a planilha existente.");
  return getDriveAccessToken(userId);
}

export async function assertSheetPrivate(token: string, id: string) {
  let page = "";
  do {
    const data = await sheetGoogle(token, `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}/permissions?fields=nextPageToken,permissions(type)&pageSize=100${page ? `&pageToken=${encodeURIComponent(page)}` : ""}`);
    if (!Array.isArray(data.permissions)) throw new Error("Não foi possível verificar quem tem acesso à planilha.");
    if (data.permissions.some((p: { type: string }) => !["user", "group"].includes(p.type))) throw new Error("Restrinja a planilha a pessoas ou grupos autorizados. Acesso público ou para todo o domínio não é permitido.");
    page = String(data.nextPageToken || "");
  } while (page);
}

export async function ensureVisitorSheet(token: string, config: VisitorSheetConfig) {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${config.spreadsheet_id}`;
  const metadata = await sheetGoogle<{sheets?: {properties: {sheetId: number; title: string; gridProperties?: {rowCount: number; columnCount: number}}}[]}>(token, `${url}?fields=sheets.properties`);
  const sheet = metadata.sheets?.find((s) => s.properties.sheetId === config.sheet_id);
  if (sheet) {
    if (!sheet.properties.gridProperties) throw new Error("A aba vinculada não possui uma grade de células válida.");
    return {...sheet.properties, gridProperties:sheet.properties.gridProperties};
  }
  if (metadata.sheets?.some((s) => s.properties.title === TITLE)) throw new Error("Já existe uma aba Vínkulo — Pessoas sem vínculo com esta integração. Renomeie essa aba para preservar seu conteúdo e tente novamente.");
  await sheetGoogle(token, `${url}:batchUpdate`, { requests: [{ addSheet: { properties: { sheetId: config.sheet_id, title: TITLE, gridProperties: { rowCount: 1001, columnCount: 40, frozenRowCount: 1 } } } }] });
  return { gridProperties: { rowCount: 1001, columnCount: 40 } };
}

export async function syncVisitorSheet(db: ReturnType<typeof getD1>, communityId: number) {
  if(await visitorDriveConfig(communityId))return;
  const tokenId = crypto.randomUUID();
  const now = Date.now();
  const lease = await db.prepare("UPDATE visitante_planilha SET lock_token = ?, lock_ate = ? WHERE comunidade_id = ? AND habilitada = 1 AND lock_ate < ?").bind(tokenId, now + 120000, communityId, now).run();
  if (!lease.meta.changes) return;
  try {
    const config = await db.prepare("SELECT * FROM visitante_planilha WHERE comunidade_id = ?").bind(communityId).first<VisitorSheetConfig>();
    if (!config) return;
    // Revoked membership cannot keep exporting with a previously saved Google token.
    const operator = await db.prepare(`SELECT u.id FROM usuarios u JOIN usuario_comunidades uc ON uc.usuario_id = u.id JOIN comunidades c ON c.id = uc.comunidade_id
      WHERE u.id = ? AND u.ativo = 1 AND uc.comunidade_id = ? AND uc.status = 'ATIVO' AND c.status = 'ATIVA'
      AND (uc.papel IN ('PASTOR','ADMIN_COMUNIDADE','SUPERADMIN') OR c.proprietario_usuario_id = u.id)`).bind(config.usuario_id, communityId).first();
    if (!operator) throw new Error("O responsável pela conexão perdeu o acesso de gestão. Um gestor deve reconectar a planilha.");
    const token = await visitorSheetToken(config.usuario_id);
    await assertSheetPrivate(token, config.spreadsheet_id);
    const properties = await ensureVisitorSheet(token, config);
    const rows = await visitorExportRows(db, communityId);
    const headers = Object.keys(rows[0] || mapVisitorExportRows([{}], await visitorCustomFields(db, communityId))[0]);
    const values = [headers, ...rows.map(row => Object.values(row))];
    const endRowIndex = Math.max(values.length, config.linhas, 1);
    const endColumnIndex = Math.max(headers.length, properties.gridProperties.columnCount, 40);
    const requests: unknown[] = [];
    if (endRowIndex > properties.gridProperties.rowCount) requests.push({ appendDimension: { sheetId: config.sheet_id, dimension: "ROWS", length: endRowIndex - properties.gridProperties.rowCount } });
    if (endColumnIndex > properties.gridProperties.columnCount) requests.push({ appendDimension: { sheetId: config.sheet_id, dimension: "COLUMNS", length: endColumnIndex - properties.gridProperties.columnCount } });
    requests.push({ updateCells: { range: { sheetId: config.sheet_id, startRowIndex: 0, startColumnIndex: 0, endRowIndex, endColumnIndex }, rows: values.map(row => ({ values: row.map(value => ({ userEnteredValue: { stringValue: String(value ?? "") } })) })), fields: "userEnteredValue" } });
    // One atomic update replaces the dedicated tab and clears rows removed from the source.
    await sheetGoogle(token, `https://sheets.googleapis.com/v4/spreadsheets/${config.spreadsheet_id}:batchUpdate`, { requests });
    await db.prepare("UPDATE visitante_planilha SET versao_sincronizada = ?, linhas = ?, sincronizado_em = CURRENT_TIMESTAMP, ultimo_erro = NULL, tentar_apos = 0 WHERE comunidade_id = ? AND lock_token = ?").bind(config.versao, values.length, communityId, tokenId).run();
  } catch (error) {
    const message = error instanceof Error && !/token|secret|credential/i.test(error.message) ? error.message.slice(0, 300) : "Reconecte sua Conta Google e tente novamente.";
    await db.prepare("UPDATE visitante_planilha SET ultimo_erro = ?, tentar_apos = ? WHERE comunidade_id = ? AND lock_token = ?").bind(message, Date.now() + 60000, communityId, tokenId).run();
  } finally {
    await db.prepare("UPDATE visitante_planilha SET lock_token = NULL, lock_ate = 0 WHERE comunidade_id = ? AND lock_token = ?").bind(communityId, tokenId).run();
  }
}

export async function syncPendingVisitorSheets(db: ReturnType<typeof getD1>) {
  const config = await db.prepare("SELECT comunidade_id FROM visitante_planilha WHERE habilitada = 1 AND versao > versao_sincronizada AND tentar_apos <= ? AND lock_ate < ? ORDER BY tentar_apos, comunidade_id LIMIT 1").bind(Date.now(), Date.now()).first<{ comunidade_id: number }>();
  if (config) await syncVisitorSheet(db, config.comunidade_id);
}
