import { getD1 } from "../../../../../db";
import { getSessionUser } from "../../../../lib/local-auth";
import { recordTenantAudit } from "../../../../lib/tenant-audit";
import { createSystemNotification } from "../../../../lib/system-notifications";
import { FirebaseInputError, prepareFirebaseCredential, publicFirebaseConfig, readFirebaseConfig, removeFirebaseConfig, saveFirebaseConfig, verifyFirebaseConfig } from "../../../../lib/firebase-integration";

const reply = (value: unknown, status = 200) => Response.json(value, { status, headers: { "Cache-Control": "no-store" } });
async function owner(request?: Request) {
  const user = await getSessionUser();
  if (!user?.ativo) return { error: reply({ error: "Entre com a conta do proprietário." }, 401) } as const;
  if (!user.system_owner) return { error: reply({ error: "Área exclusiva do proprietário." }, 403) } as const;
  if (request && (request.headers.get("origin") !== new URL(request.url).origin || request.headers.get("sec-fetch-site") === "cross-site")) {
    return { error: reply({ error: "Origem da solicitação não autorizada." }, 403) } as const;
  }
  return { user } as const;
}
export async function boundedJson(request: Request, maximum = 24576): Promise<Record<string, unknown>> {
  const reader = request.body?.getReader();
  if (!reader) throw new FirebaseInputError("Solicitação vazia.");
  const chunks: Uint8Array[] = []; let length = 0;
  try {
    while (true) {
      const next = await reader.read(); if (next.done) break;
      length += next.value.byteLength;
      if (length > maximum) { await reader.cancel(); throw new FirebaseInputError("Arquivo maior que o limite permitido."); }
      chunks.push(next.value);
    }
    const all = new Uint8Array(length); let offset = 0;
    for (const chunk of chunks) { all.set(chunk, offset); offset += chunk.byteLength; }
    const payload = JSON.parse(new TextDecoder().decode(all));
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new Error();
    return payload;
  } catch (error) { if (error instanceof FirebaseInputError) throw error; throw new FirebaseInputError("Solicitação inválida."); }
  finally { reader.releaseLock(); }
}
async function deviceCount(userId: number) {
  return (await getD1().prepare(`SELECT COUNT(*) AS total FROM notificacoes_push_dispositivos p
    JOIN sessoes s ON s.token_hash=p.sessao_token_hash AND s.usuario_id=p.usuario_id
    WHERE p.usuario_id=? AND p.endpoint LIKE 'fcm:%' AND datetime(s.expira_em)>CURRENT_TIMESTAMP`).bind(userId).first<{ total: number }>())?.total || 0;
}
export async function GET() {
  const access = await owner(); if ("error" in access) return access.error;
  try { return reply({ ...publicFirebaseConfig(await readFirebaseConfig()), myDevices: await deviceCount(access.user.id) }); }
  catch { return reply({ error: "Não foi possível consultar o Firebase." }, 503); }
}
export async function PATCH(request: Request) {
  const access = await owner(request); if ("error" in access) return access.error;
  try {
    const payload = await boundedJson(request);
    if (payload.confirm !== true) throw new FirebaseInputError("Confirme o uso da credencial para notificações.");
    const config = await verifyFirebaseConfig(await prepareFirebaseCredential(payload.credential));
    await saveFirebaseConfig(config, access.user.id);
    await recordTenantAudit(getD1(), { comunidadeId: null }, access.user.id, "INTEGRACAO_FIREBASE_SALVA", "SUCESSO", { projectId: config.projectId });
    return GET();
  } catch (error) {
    // Do not record the request, provider response, key or JWT in audit/logs.
    return reply({ error: error instanceof FirebaseInputError ? error.message : "Não foi possível verificar e salvar a credencial. Tente novamente." }, error instanceof FirebaseInputError ? 400 : 503);
  }
}
export async function POST(request: Request) {
  const access = await owner(request); if ("error" in access) return access.error;
  try {
    const payload = await boundedJson(request);
    const config = await readFirebaseConfig();
    if (!config) throw new FirebaseInputError("Cadastre a credencial primeiro.");
    if (payload.action === "test-device") {
      if (!await deviceCount(access.user.id)) throw new FirebaseInputError("Instale o APK atualizado, permita notificações e entre com esta conta para registrar o aparelho.");
      await createSystemNotification(getD1(), { titulo: "Teste de notificação Android", mensagem: "Teste solicitado pelo proprietário.", area: "MENU", usuarioId: access.user.id, criadoPor: String(access.user.id), destinoRota: "/painel" });
      return reply({ message: "Teste colocado na fila para os seus aparelhos. Confirme o recebimento no celular." });
    }
    if (payload.action !== "verify") throw new FirebaseInputError("Ação inválida.");
    const checked = await verifyFirebaseConfig(config);
    // Compare-and-set: a concurrent deletion/replacement must not restore an old key.
    await getD1().prepare("UPDATE configuracoes SET valor=? WHERE chave='firebase_fcm_integration' AND valor=?").bind(JSON.stringify(checked), JSON.stringify(config)).run();
    return GET();
  } catch (error) { return reply({ error: error instanceof FirebaseInputError ? error.message : "Não foi possível concluir a verificação." }, error instanceof FirebaseInputError ? 400 : 503); }
}
export async function DELETE(request: Request) {
  const access = await owner(request); if ("error" in access) return access.error;
  try {
    if ((await boundedJson(request)).confirm !== "REMOVER_FIREBASE") throw new FirebaseInputError("Confirme a desconexão do Firebase.");
    await removeFirebaseConfig();
    await recordTenantAudit(getD1(), { comunidadeId: null }, access.user.id, "INTEGRACAO_FIREBASE_REMOVIDA", "SUCESSO");
    return GET();
  } catch { return reply({ error: "Não foi possível desconectar o Firebase." }, 400); }
}
