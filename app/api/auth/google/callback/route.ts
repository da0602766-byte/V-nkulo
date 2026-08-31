import { getD1 } from "../../../../../db";
import { attachSessionCookie, createSession, getSessionUser, hashPassword, normalizeEmail } from "../../../../lib/local-auth";
import { getPilotLoginConfig } from "../../../../lib/pilot-login-config";
import { PILOT_CONFIG } from "../../../../lib/pilot-config";
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
      state.purpose === "drive" ? "/painel?view=conta" : "/login",
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
         FROM usuarios u
         LEFT JOIN google_connections gc ON gc.usuario_id = u.id
         WHERE gc.google_sub = ? OR lower(u.email) = ?
         ORDER BY CASE WHEN gc.google_sub = ? THEN 0 ELSE 1 END
         LIMIT 1`,
      ).bind(identity.sub, normalizeEmail(identity.email), identity.sub).first<{ id: number; ativo: number }>();
      if (!row) {
        const loginConfig = await getPilotLoginConfig();
        if (!PILOT_CONFIG.openRegistrationEnabled || loginConfig.cadastroHabilitado === false) {
          throw new Error("A criação de novas contas está temporariamente desativada.");
        }
        const generatedPassword = await hashPassword(randomGoogleOnlyPassword());
        const name = String(identity.name || identity.email.split("@")[0] || "Nova conta")
          .trim().slice(0, 120);
        try {
          const result = await getD1().prepare(
            `INSERT INTO usuarios
              (nome, email, perfil, permissoes, cadastro_dados, senha_hash, senha_salt,
               titulo_eclesiastico, ativo)
             VALUES (?, ?, 'LEITURA', '', ?, ?, ?, 'VISITANTE', 1)`,
          ).bind(
            name.length >= 3 ? name : `Usuário ${name}`,
            normalizeEmail(identity.email),
            JSON.stringify({ origem: { label: "Origem", value: "Conta Google verificada" } }),
            generatedPassword.hash,
            generatedPassword.salt,
          ).run();
          const createdUserId = Number(result.meta.last_row_id);
          await getD1().prepare(
            `INSERT INTO auditoria_piloto
              (comunidade_id, usuario_id, evento, resultado, metadados)
             VALUES (NULL, ?, 'CONTA_GOOGLE_CRIADA', 'SUCESSO', ?)`,
          ).bind(
            createdUserId,
            JSON.stringify({ membershipCreated: false, roleGranted: false, emailVerified: true }),
          ).run();
          row = { id: createdUserId, ativo: 1 };
        } catch {
          row = await getD1().prepare(
            "SELECT id, ativo FROM usuarios WHERE lower(email) = ? LIMIT 1",
          ).bind(normalizeEmail(identity.email)).first<{ id: number; ativo: number }>();
          if (!row) throw new Error("Não foi possível criar sua conta com o Google. Tente novamente.");
        }
      }
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
    if (state.purpose === "drive") {
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
      state.purpose === "drive" ? "/painel?view=conta" : "/login",
      (error as Error).message,
    );
  }
}

function randomGoogleOnlyPassword() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
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
