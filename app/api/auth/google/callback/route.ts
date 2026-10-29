import { getD1 } from "../../../../../db";
import { attachSessionCookie, createSession, getSessionUser, normalizeEmail } from "../../../../lib/local-auth";
import { auditAccess } from "../../../../lib/access-security";
import { AuthLinkError, linkAuthAfterVerifiedGoogleLogin } from "../../../../lib/supabase-auth-link";
import {
  exchangeGoogleCode,
  readGoogleState,
  saveGoogleConnection,
  verifyGoogleIdentity,
} from "../../../../lib/google-integration";
import {
  failGoogleNativeHandoff,
  finishGoogleNativeHandoff,
  readGoogleNativeHandoff,
} from "../../../../lib/google-native-handoff";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const state = await readGoogleState(String(url.searchParams.get("state") || ""));
  const cookieNonce = readCookie(request.headers.get("cookie"), "__Host-vinkulo_google_state");
  const nativeHandoff = state?.channel === "android" && Boolean(state.pairingHash);
  if (!state || (!nativeHandoff && (!cookieNonce || cookieNonce !== state.nonce))) {
    return redirectWithError(url.origin, "/login", "A autorização do Google expirou. Tente novamente.");
  }
  const handoff = nativeHandoff ? await readGoogleNativeHandoff(state.pairingHash!) : null;
  if (nativeHandoff && (!handoff || handoff.purpose !== state.purpose || Date.parse(handoff.expires_at) <= Date.now())) {
    return nativeReturn(url.origin, "A autorização do aplicativo expirou. Tente novamente.");
  }
  const code = String(url.searchParams.get("code") || "");
  const googleError = String(url.searchParams.get("error") || "");
  if (!code || googleError) {
    const message = googleError === "access_denied" ? "Você não autorizou o acesso ao Google." : "O Google não concluiu a autorização.";
    if (nativeHandoff) {
      await failGoogleNativeHandoff(state.pairingHash!, message);
      return nativeReturn(url.origin, message);
    }
    return redirectWithError(
      url.origin,
      state.personalVisitors ? "/painel/visitantes?lista=pessoal" : state.visitorStorage ? "/painel/visitantes?section=armazenamento" : state.visitorSheets ? "/painel/visitantes?sheetSetup=error" : state.purpose === "drive" ? "/painel?view=conta" : "/login",
      message,
    );
  }
  try {
    const tokens = await exchangeGoogleCode(code, url.origin);
    const identity = await verifyGoogleIdentity(tokens.id_token!);
    let userId = state.userId;
    if (state.purpose === "login") {
      let row = await getD1().prepare(
        `SELECT u.id, u.ativo
         FROM google_connections gc
         JOIN usuarios u ON u.id = gc.usuario_id
         WHERE gc.google_sub = ? LIMIT 1`,
      ).bind(identity.sub).first<{ id: number; ativo: number }>();
      if (!row) {
        row = await getD1().prepare(
          "SELECT id, ativo FROM usuarios WHERE email = ? LIMIT 1",
        ).bind(normalizeEmail(identity.email)).first<{ id: number; ativo: number }>();
      }
      if (!row) throw new Error("Novas contas exigem um convite temporário da comunidade. Para criar uma comunidade, use o LOG1.");
      if (!row.ativo) throw new Error("Este cadastro está inativo. Solicite revisão ao suporte.");
      userId = row.id;
    } else if (nativeHandoff) {
      if (Number(handoff!.requested_user_id) !== state.userId) {
        throw new Error("A Conta Google não corresponde à solicitação iniciada no aplicativo.");
      }
    } else {
      const sessionUser = await getSessionUser();
      if (!sessionUser || Number(sessionUser.id) !== state.userId) throw new Error("Sua sessão mudou durante a autorização. Entre novamente.");
      if (normalizeEmail(sessionUser.email) !== normalizeEmail(identity.email)) {
        throw new Error("Conecte ao Drive a mesma Conta Google usada no e-mail do seu cadastro.");
      }
    }
    await saveGoogleConnection(userId, identity, tokens, state.purpose === "drive");
    if (identity.picture) {
      await getD1().prepare(
        "UPDATE usuarios SET foto_perfil = CASE WHEN foto_perfil IS NULL OR foto_perfil = '' THEN ? ELSE foto_perfil END, atualizado_em = CURRENT_TIMESTAMP WHERE id = ?",
      ).bind(identity.picture, userId).run();
    }
    if (state.purpose === "drive") {
      if (state.visitorSheets || state.visitorStorage || state.personalVisitors) {
        const target = new URL(state.returnTo || "/painel/visitantes", url.origin);
        target.searchParams.set("google", "connected");
        return clearStateCookie(mutableRedirect(target));
      }
      await getD1().prepare(
        `INSERT INTO storage_preferences
          (usuario_id, provider, auto_load_recent, auto_download_files, consented_at, updated_at)
         VALUES (?, 'GOOGLE_DRIVE', 1, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
         ON CONFLICT(usuario_id) DO UPDATE SET provider = 'GOOGLE_DRIVE',
           consented_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP`,
      ).bind(userId).run();
      if (nativeHandoff) {
        await finishGoogleNativeHandoff(state.pairingHash!, userId);
        return clearStateCookie(nativeReturn(url.origin));
      }
      const target = new URL(state.returnTo || "/painel?view=conta", url.origin);
      target.searchParams.set("google", "connected");
      return clearStateCookie(mutableRedirect(target));
    }
    // Both browser and Android logins reach this point only after Google identity
    // validation and the existing-account check. Drive-only consent returns above.
    try {
      const outcome = await linkAuthAfterVerifiedGoogleLogin(userId, identity);
      if (outcome !== "SKIPPED") await auditAccess("SUPABASE_AUTH_LINK", userId, { outcome, source: "GOOGLE" });
    } catch (error) {
      await auditAccess("SUPABASE_AUTH_LINK", userId,
        { reason: error instanceof AuthLinkError ? error.code : "UNAVAILABLE", source: "GOOGLE" }, null, "ERRO").catch(() => {});
    }
    if (nativeHandoff) {
      await finishGoogleNativeHandoff(state.pairingHash!, userId);
      return clearStateCookie(nativeReturn(url.origin));
    }
    const session = await createSession(userId);
    return clearStateCookie(attachSessionCookie(mutableRedirect(new URL(state.returnTo || "/painel", url.origin)), session));
  } catch (error) {
    if (nativeHandoff) {
      await failGoogleNativeHandoff(state.pairingHash!, (error as Error).message);
      return clearStateCookie(nativeReturn(url.origin, (error as Error).message));
    }
    return redirectWithError(
      url.origin,
      state.personalVisitors ? "/painel/visitantes?lista=pessoal" : state.visitorStorage ? "/painel/visitantes?section=armazenamento" : state.visitorSheets ? "/painel/visitantes?sheetSetup=error" : state.purpose === "drive" ? "/painel?view=conta" : "/login",
      (error as Error).message,
    );
  }
}

function nativeReturn(origin: string, message = "") {
  const target = new URL("/login/google-concluido", origin);
  if (message) target.searchParams.set("erro", message);
  return mutableRedirect(target);
}

function readCookie(header: string | null, name: string) {
  const item = String(header || "").split(";").map((value) => value.trim()).find((value) => value.startsWith(`${name}=`));
  return item ? decodeURIComponent(item.slice(name.length + 1)) : "";
}

function clearStateCookie(response: Response) {
  response.headers.append("Set-Cookie", "__Host-vinkulo_google_state=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax");
  return response;
}

function mutableRedirect(target: URL | string) {
  return new Response(null, {
    status: 303,
    headers: {
      Location: String(target),
      "Cache-Control": "no-store",
    },
  });
}

function redirectWithError(origin: string, path: string, message: string) {
  const target = new URL(path, origin);
  target.searchParams.set(path.startsWith("/login") ? "erro" : "googleErro", message);
  return clearStateCookie(mutableRedirect(target));
}
