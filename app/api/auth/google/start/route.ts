import { getSessionUser } from "../../../../lib/local-auth";
import { safeRelativeReturnPath } from "../../../../lib/safe-return-path";
import { createGoogleAuthorization } from "../../../../lib/google-integration";
import {
  googlePairingHash,
  prepareGoogleNativeHandoff,
  validGooglePairingSecret,
} from "../../../../lib/google-native-handoff";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const purpose = url.searchParams.get("purpose") === "drive" ? "drive" : "login";
  const user = await getSessionUser();
  if (purpose === "drive" && !user) {
    return Response.redirect(new URL("/login?erro=Entre antes de conectar o Google Drive.", url.origin), 303);
  }
  const returnTo = safeRelativeReturnPath(
    url.searchParams.get("returnTo"),
    purpose === "drive" ? "/painel?view=conta" : "/painel",
  );
  const androidChannel = url.searchParams.get("channel") === "android";
  const pairingSecret = String(url.searchParams.get("pairing") || "");
  if (androidChannel && !validGooglePairingSecret(pairingSecret)) {
    return Response.json({ error: "Não foi possível preparar o retorno ao aplicativo." }, { status: 400 });
  }
  try {
    const pairingHash = androidChannel ? await googlePairingHash(pairingSecret) : undefined;
    if (pairingHash) {
      await prepareGoogleNativeHandoff({
        pairingHash,
        purpose,
        requestedUserId: purpose === "drive" ? Number(user!.id) : null,
        returnTo,
      });
    }
    const authorization = await createGoogleAuthorization(url.origin, {
      purpose,
      userId: purpose === "drive" ? Number(user!.id) : 0,
      returnTo,
      channel: androidChannel ? "android" : undefined,
      pairingHash,
    });
    if (androidChannel && url.searchParams.get("format") === "json") {
      return Response.json(
        { authorizationUrl: authorization.url },
        { headers: { "Cache-Control": "no-store" } },
      );
    }
    return new Response(null, {
      status: 303,
      headers: {
        Location: authorization.url,
        "Set-Cookie": `__Host-vinkulo_google_state=${authorization.nonce}; Path=/; Max-Age=600; HttpOnly; Secure; SameSite=Lax`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const message = (error as Error).message;
    if (androidChannel && url.searchParams.get("format") === "json") {
      return Response.json(
        { error: message },
        { status: 503, headers: { "Cache-Control": "no-store" } },
      );
    }
    const target = new URL(purpose === "drive" ? "/painel" : "/login", url.origin);
    if (purpose === "drive") {
      target.searchParams.set("view", "conta");
      target.searchParams.set("googleErro", message);
    } else {
      target.searchParams.set("erro", message);
    }
    return Response.redirect(target, 303);
  }
}
