import { rateLimit } from "../../../lib/access-security";
import { consumeResetToken, validatePassword } from "../../../lib/local-auth";
import { syncAuthAfterPasswordChange } from "../../../lib/supabase-auth-link";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { token?: string; senha?: string } | null;
  if (!body || typeof body !== "object") {
    return Response.json({ error: "Não foi possível ler os dados de redefinição." }, { status: 400 });
  }
  const token = String(body.token || "");
  if (!(await rateLimit(request, "reset-password", token.slice(0, 64) || "invalid", 8))) {
    return Response.json({ error: "Muitas tentativas. Aguarde 15 minutos e tente novamente." }, { status: 429 });
  }
  const password = String(body.senha || "");
  const error = validatePassword(password);
  if (error) return Response.json({ error }, { status: 400 });
  const userId = await consumeResetToken(token, password);
  if (!userId) return Response.json({ error: "Este link é inválido, já foi usado ou expirou." }, { status: 400 });
  await syncAuthAfterPasswordChange(userId, password, "RESET").catch(() => {});
  return Response.json({ ok: true });
}
