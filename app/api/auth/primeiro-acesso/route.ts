import {
  attachSessionCookie,
  consumeFirstAccessToken,
  createSession,
  normalizeEmail,
  validatePassword,
} from "../../../lib/local-auth";

type FirstAccessPayload = {
  token?: string;
  email?: string;
  temporaryPassword?: string;
  password?: string;
  confirmPassword?: string;
};

export async function POST(request: Request) {
  let body: FirstAccessPayload;
  try {
    body = await request.json() as FirstAccessPayload;
  } catch {
    return Response.json({ error: "Não foi possível ler os dados de acesso." }, { status: 400 });
  }

  const token = String(body.token || "");
  const email = normalizeEmail(body.email);
  const temporaryPassword = String(body.temporaryPassword || "");
  const password = String(body.password || "");
  const confirmPassword = String(body.confirmPassword || "");
  if (!token || !email || !temporaryPassword) {
    return Response.json({ error: "Informe o login e a senha temporária recebidos." }, { status: 400 });
  }
  const passwordError = validatePassword(password);
  if (passwordError) return Response.json({ error: passwordError }, { status: 400 });
  if (password !== confirmPassword) {
    return Response.json({ error: "As novas senhas não conferem." }, { status: 400 });
  }

  const result = await consumeFirstAccessToken({
    token,
    email,
    temporaryPassword,
    newPassword: password,
  });
  if (!result.ok) {
    const message = result.reason === "SAME_PASSWORD"
      ? "A nova senha precisa ser diferente da senha temporária."
      : "Link, login ou senha temporária inválidos ou expirados.";
    return Response.json({ error: message }, { status: result.reason === "SAME_PASSWORD" ? 400 : 401 });
  }

  const session = await createSession(result.userId);
  return attachSessionCookie(
    Response.json(
      { ok: true, redirect: "/painel" },
      { headers: { "Cache-Control": "no-store" } },
    ),
    session,
  );
}
