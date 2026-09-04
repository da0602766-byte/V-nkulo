import { loginLimit, recordFailedLogin } from "../../../lib/login-rate-limit";
import { getD1 } from "../../../../db";
import { attachSessionCookie, createFirstAccessToken, createSession, normalizeEmail, verifyPassword, hashPassword } from "../../../lib/local-auth";
import { safeRelativeReturnPath } from "../../../lib/safe-return-path";

type LoginRow = { id: number; perfil: string; senha_hash: string | null; senha_salt: string | null; tentativas_login: number; bloqueado_ate: string | null; ativo: number; primeiro_acesso_pendente: number };

export async function POST(request: Request) {
  const contentType = request.headers.get("content-type") || "";
  const isBrowserForm = contentType.includes("application/x-www-form-urlencoded") || contentType.includes("multipart/form-data");
  let payload: Record<string, unknown>;
  try { payload = isBrowserForm ? Object.fromEntries((await request.formData()).entries()) : await request.json(); }
  catch { return Response.json({ error: "Dados de acesso inválidos." }, { status: 400 }); }
  const { email, senha, returnTo } = payload as { email?: string; senha?: string; returnTo?: string };
  const safeReturnTo = safeRelativeReturnPath(returnTo, "");
  const fail = (message: string, status: number) => {
    if (!isBrowserForm) return Response.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("erro", message);
    if (safeReturnTo) loginUrl.searchParams.set("returnTo", safeReturnTo);
    return Response.redirect(loginUrl, 303);
  };
  const cleanEmail = normalizeEmail(email);
  const genericFailure = "E-mail ou senha inválidos. Tente novamente ou use a recuperação de acesso.";
  const limit = await loginLimit(request, cleanEmail);
  if (!limit.allowed) return fail("Muitas tentativas nesta conexão. Aguarde antes de tentar novamente.", 429);
  const db = getD1();
  const user = await db.prepare(
    `SELECT u.id, u.perfil, u.senha_hash, u.senha_salt, u.tentativas_login,
      u.bloqueado_ate, u.ativo,
      EXISTS(
        SELECT 1 FROM redefinicoes_senha r
        WHERE r.usuario_id = u.id AND r.usado = 0 AND r.token_hash LIKE 'first:%'
      ) AS primeiro_acesso_pendente
     FROM usuarios u WHERE u.email = ? LIMIT 1`,
  ).bind(cleanEmail).first<LoginRow>();
  // Missing, inactive and wrong-password accounts share response and password work.
  const started = Date.now();
  const valid = await verifyPassword(String(senha || ""),
    user?.senha_salt || "00000000000000000000000000000000",
    user?.senha_hash || "pbkdf2-sha256$600000$0000000000000000000000000000000000000000000000000000000000000000");
  if (!valid || !user?.ativo || !user.senha_hash || !user.senha_salt) {
    // Equal minimum response time for legacy/current/missing accounts; no busy CPU delay.
    await new Promise(resolve => setTimeout(resolve, Math.max(0, 350 - (Date.now() - started))));
    await recordFailedLogin(limit.account);
    return fail(genericFailure, 401);
  }
  await db.prepare("UPDATE usuarios SET tentativas_login = 0, bloqueado_ate = NULL, atualizado_em = CURRENT_TIMESTAMP WHERE id = ?").bind(user.id).run();
  if (user.primeiro_acesso_pendente) {
    const firstAccess = await createFirstAccessToken(user.id);
    const firstAccessPath = `/primeiro-acesso?token=${encodeURIComponent(firstAccess.token)}&login=${encodeURIComponent(cleanEmail)}`;
    if (isBrowserForm) {
      return new Response(null, {
        status: 303,
        headers: { Location: new URL(firstAccessPath, request.url).toString(), "Cache-Control": "no-store" },
      });
    }
    return Response.json(
      { ok: true, firstAccessRequired: true, redirect: firstAccessPath },
      { headers: { "Cache-Control": "no-store" } },
    );
  }
  let sessionPasswordHash = user.senha_hash;
  if (!user.senha_hash.startsWith("pbkdf2-sha256$600000$")) {
    const upgraded = await hashPassword(String(senha));
    // CAS avoids overwriting a password changed by a concurrent recovery request.
    const update = await db.prepare("UPDATE usuarios SET senha_hash = ?, senha_salt = ? WHERE id = ? AND senha_hash = ?")
      .bind(upgraded.hash, upgraded.salt, user.id, user.senha_hash).run();
    if (!update.meta.changes) return fail(genericFailure, 401);
    sessionPasswordHash = upgraded.hash;
  }
  const membership = await db
    .prepare(
      `SELECT uc.id FROM usuario_comunidades uc
      JOIN comunidades c ON c.id = uc.comunidade_id
      WHERE uc.usuario_id = ? AND uc.status = 'ATIVO' AND c.status = 'ATIVA'
      LIMIT 1`,
    )
    .bind(user.id)
    .first<{ id: number }>();
  const redirectTarget = safeReturnTo || (membership ? "/painel" : "/comunidades?conta=ativa");
  let session: Awaited<ReturnType<typeof createSession>>;
  try { session = await createSession(user.id, sessionPasswordHash); }
  catch { return fail(genericFailure, 401); }
  if (isBrowserForm) {
    const response = new Response(null, { status: 303, headers: { Location: new URL(redirectTarget, request.url).toString(), "Cache-Control": "no-store" } });
    return attachSessionCookie(response, session);
  }
  return attachSessionCookie(Response.json({ ok: true, ativo: Boolean(user.ativo), redirect: redirectTarget }), session);
}
