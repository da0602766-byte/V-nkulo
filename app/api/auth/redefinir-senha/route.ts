import { consumeResetToken, validatePassword } from "../../../lib/local-auth";
import { syncAuthAfterPasswordChange } from "../../../lib/supabase-auth-link";

export async function POST(request: Request) {
  const { token, senha } = await request.json() as { token?: string; senha?: string };
  const password = String(senha || "");
  const error = validatePassword(password);
  if (error) return Response.json({ error }, { status: 400 });
  const userId = await consumeResetToken(String(token || ""), password);
  if (!userId) return Response.json({ error: "Este link é inválido, já foi usado ou expirou." }, { status: 400 });
  await syncAuthAfterPasswordChange(userId, password, "RESET").catch(() => {});
  return Response.json({ ok: true });
}
