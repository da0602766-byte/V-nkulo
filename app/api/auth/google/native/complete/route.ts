import { attachSessionCookie, createSession, getSessionUser } from "../../../../../lib/local-auth";
import {
  consumeGoogleNativeHandoff,
  googlePairingHash,
  readGoogleNativeHandoff,
  validGooglePairingSecret,
} from "../../../../../lib/google-native-handoff";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({})) as { pairing?: string };
  const pairing = String(body.pairing || "");
  if (!validGooglePairingSecret(pairing)) return json({ status: "invalid" }, 400);
  const pairingHash = await googlePairingHash(pairing);
  const handoff = await readGoogleNativeHandoff(pairingHash);
  if (!handoff) return json({ status: "pending" }, 202);
  if (Date.parse(handoff.expires_at) <= Date.now()) {
    await consumeGoogleNativeHandoff(pairingHash);
    return json({ status: "expired", error: "O retorno do Google expirou. Tente novamente." }, 410);
  }
  if (!handoff.completed_at) return json({ status: "pending" }, 202);
  if (handoff.error_message) {
    await consumeGoogleNativeHandoff(pairingHash);
    return json({ status: "failed", error: handoff.error_message }, 400);
  }
  if (!handoff.completed_user_id) return json({ status: "pending" }, 202);

  if (handoff.purpose === "drive") {
    const user = await getSessionUser();
    if (!user || Number(user.id) !== handoff.completed_user_id) {
      return json({ status: "failed", error: "A sessão do aplicativo mudou. Entre novamente." }, 401);
    }
    await consumeGoogleNativeHandoff(pairingHash);
    return json({ status: "complete", returnTo: handoff.return_to });
  }

  const session = await createSession(handoff.completed_user_id);
  await consumeGoogleNativeHandoff(pairingHash);
  return attachSessionCookie(json({ status: "complete", returnTo: handoff.return_to }), session);
}

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}
