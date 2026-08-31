import { getD1 } from "../../../../db";
import {
  attachPreviewSessionCookie,
  createSession,
} from "../../../lib/local-auth";
import { safeRelativeReturnPath } from "../../../lib/safe-return-path";

type PreviewUserRow = { id: number };

function isLoopbackPreview(request: Request) {
  const hostname = new URL(request.url).hostname.toLowerCase();
  return hostname === "127.0.0.1" || hostname === "localhost" || hostname === "::1";
}

export async function GET(request: Request) {
  if (!isLoopbackPreview(request)) {
    return Response.json(
      { error: "O acesso automático existe somente na prévia local." },
      { status: 403 },
    );
  }

  const requestUrl = new URL(request.url);
  const returnTo = safeRelativeReturnPath(
    requestUrl.searchParams.get("returnTo"),
    "/painel",
  );
  const user = await getD1()
    .prepare(
      `SELECT DISTINCT u.id
      FROM usuarios u
      JOIN usuario_comunidades uc ON uc.usuario_id = u.id
      JOIN comunidades c ON c.id = uc.comunidade_id
      WHERE u.ativo = 1
        AND u.senha_hash IS NOT NULL
        AND u.senha_salt IS NOT NULL
        AND uc.status = 'ATIVO'
        AND c.status = 'ATIVA'
      -- Os papéis 'PROPRIETARIO' e 'ADMIN' não existem no catálogo atual
      -- (LIDER, PASTOR, ADMIN_COMUNIDADE, PROPRIETARIO_VISUALIZADOR,
      -- SUPERADMIN), então SUPERADMIN e ADMIN_COMUNIDADE caíam no ELSE e a
      -- prévia local elegia um pastor. Efeito prático: a área do proprietário
      -- ficava inacessível justamente na prévia, que é onde se confere.
      ORDER BY
        CASE uc.papel
          WHEN 'SUPERADMIN' THEN 0
          WHEN 'ADMIN_COMUNIDADE' THEN 1
          WHEN 'PASTOR' THEN 2
          WHEN 'LIDER' THEN 3
          ELSE 4
        END,
        u.id ASC
      LIMIT 1`,
    )
    .first<PreviewUserRow>();

  if (!user) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("auto", "0");
    loginUrl.searchParams.set(
      "erro",
      "A prévia local ainda não possui uma conta ativa para acesso automático.",
    );
    return Response.redirect(loginUrl, 303);
  }

  const session = await createSession(user.id);
  const response = new Response(null, {
    status: 303,
    headers: {
      Location: new URL(returnTo, request.url).toString(),
      "Cache-Control": "no-store",
    },
  });
  return attachPreviewSessionCookie(response, session);
}
