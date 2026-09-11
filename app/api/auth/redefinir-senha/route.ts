import { consumeResetToken, validatePassword } from "../../../lib/local-auth";

export async function POST(request: Request) {
  const { token, senha } = await request.json() as { token?: string; senha?: string };
  const password = String(senha || "");
  const error = validatePassword(password);
  if (error) return Response.json({ error }, { status: 400 });
  const success = await consumeResetToken(String(token || ""), password);
  if (!success) return Response.json({ error: "Este link é inválido, já foi usado ou expirou." }, { status: 400 });
  return Response.json({ ok: true });
}
