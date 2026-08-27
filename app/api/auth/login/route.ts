import { getD1 } from "../../../../db";
import { attachSessionCookie, createSession, normalizeEmail, verifyPassword } from "../../../lib/local-auth";
import { safeRelativeReturnPath } from "../../../lib/safe-return-path";

type LoginRow = { id: number; perfil: string; senha_hash: string | null; senha_salt: string | null; tentativas_login: number; bloqueado_ate: string | null; ativo: number };

export async function POST(request: Request) {
  const contentType = request.headers.get("content-type") || "";
  const isBrowserForm = contentType.includes("application/x-www-form-urlencoded") || contentType.includes("multipart/form-data");
  const payload = isBrowserForm
    ? Object.fromEntries((await request.formData()).entries())
    : await request.json() as { email?: string; senha?: string; returnTo?: string };
  const { email, senha, returnTo } = payload as { email?: string; senha?: string; returnTo?: string };
  const safeReturnTo = safeRelativeReturnPath(returnTo, "");
  const fail = (message: string, status: number) => {
    if (!isBrowserForm) return Response.json({ error: message }, { status });
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("erro", message);
    if (safeReturnTo) loginUrl.searchParams.set("returnTo", safeReturnTo);
    return Response.redirect(loginUrl, 303);
  };
  const cleanEmail = normalizeEmail(email);
  const db = getD1();
  const user = await db.prepare("SELECT id, perfil, senha_hash, senha_salt, tentativas_login, bloqueado_ate, ativo FROM usuarios WHERE email = ? LIMIT 1").bind(cleanEmail).first<LoginRow>();
  if (!user?.senha_hash || !user.senha_salt) return fail("E-mail ou senha inválidos. Se for seu primeiro acesso, use seu convite individual ou fale com o administrador.", 401);
  if (user.bloqueado_ate && new Date(user.bloqueado_ate).getTime() > Date.now()) return fail("Acesso temporariamente bloqueado após 3 tentativas. Use Esqueci minha senha ou aguarde 15 minutos.", 429);
  const valid = await verifyPassword(String(senha || ""), user.senha_salt, user.senha_hash);
  if (!valid) {
    // Incremento atômico no próprio SQL: duas tentativas simultâneas não podem
    // ler o mesmo contador antigo e "perder" um incremento (o que permitiria
    // mais de 3 tentativas em paralelo antes do bloqueio).
    const counter = await db
      .prepare("UPDATE usuarios SET tentativas_login = tentativas_login + 1 WHERE id = ? RETURNING tentativas_login")
      .bind(user.id)
      .first<{ tentativas_login: number }>();
    const attempts = Number(counter?.tentativas_login || 1);
    if (attempts >= 3) {
      const blockedUntil = new Date(Date.now() + 15 * 60000).toISOString();
      await db.prepare("UPDATE usuarios SET tentativas_login = 0, bloqueado_ate = ? WHERE id = ?").bind(blockedUntil, user.id).run();
      return fail("Você errou a senha 3 vezes. Use Esqueci minha senha ou aguarde 15 minutos.", 401);
    }
    return fail(`E-mail ou senha inválidos. Restam ${3 - attempts} tentativa(s).`, 401);
  }
  if (!user.ativo) {
    return fail("Este cadastro está inativo. Solicite revisão ao suporte.", 403);
  }
  await db.prepare("UPDATE usuarios SET tentativas_login = 0, bloqueado_ate = NULL, atualizado_em = CURRENT_TIMESTAMP WHERE id = ?").bind(user.id).run();
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
  const session = await createSession(user.id);
  if (isBrowserForm) {
    const response = new Response(null, { status: 303, headers: { Location: new URL(redirectTarget, request.url).toString(), "Cache-Control": "no-store" } });
    return attachSessionCookie(response, session);
  }
  return attachSessionCookie(Response.json({ ok: true, ativo: Boolean(user.ativo), redirect: redirectTarget }), session);
}
