import { createGoogleAuthorization } from "./google-integration";
import { googlePairingHash, prepareGoogleNativeHandoff, validGooglePairingSecret } from "./google-native-handoff";

// Called only after the feature's own permission and ownership checks.
export async function googleAuthorizationResponse(
  request: Request,
  state: Parameters<typeof createGoogleAuthorization>[1],
  input: { channel?: unknown; pairing?: unknown },
) {
  const native = input.channel === "android";
  if (native && !validGooglePairingSecret(input.pairing)) {
    return Response.json({ error: "Não foi possível preparar o retorno ao aplicativo." }, { status: 400 });
  }
  const pairingHash = native ? await googlePairingHash(String(input.pairing)) : undefined;
  if (pairingHash) {
    await prepareGoogleNativeHandoff({ pairingHash, purpose: state.purpose, requestedUserId: state.userId, returnTo: state.returnTo });
  }
  const authorization = await createGoogleAuthorization(new URL(request.url).origin, {
    ...state, channel: native ? "android" : undefined, pairingHash,
  });
  const headers = new Headers({ "Cache-Control": "no-store" });
  if (!native) headers.set("Set-Cookie", `__Host-vinkulo_google_state=${authorization.nonce}; Path=/; Max-Age=600; HttpOnly; Secure; SameSite=Lax`);
  return Response.json({ url: authorization.url }, { headers });
}
