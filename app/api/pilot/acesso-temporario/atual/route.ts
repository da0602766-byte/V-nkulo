import { cookies } from "next/headers";
import { getD1 } from "../../../../../db";
import { getSessionUser } from "../../../../lib/local-auth";
import {
  clearTemporaryAccessCookie,
  getTemporaryAccessByToken,
  TEMPORARY_ACCESS_COOKIE,
  temporaryResourceLabel,
} from "../../../../lib/temporary-access";

export async function GET() {
  const user = await getSessionUser();
  if (!user) {
    return clearTemporaryAccessCookie(
      Response.json({ error: "Sessão ausente." }, { status: 401 }),
    );
  }
  const token = (await cookies()).get(TEMPORARY_ACCESS_COOKIE)?.value;
  if (!token) {
    return Response.json(
      { error: "Nenhuma autorização temporária ativa." },
      { status: 404 },
    );
  }
  const grant = await getTemporaryAccessByToken(getD1(), token);
  if (!grant || Number(grant.beneficiario_usuario_id) !== Number(user.id)) {
    return clearTemporaryAccessCookie(
      Response.json(
        { error: "Autorização temporária inválida." },
        { status: 403 },
      ),
    );
  }
  const response = Response.json(
    {
      id: grant.id,
      status: grant.status,
      recurso: grant.recurso,
      recursoLabel: temporaryResourceLabel(grant.recurso),
      comunidadeId: grant.comunidade_id,
      iniciaEm: grant.inicia_em,
      terminaEm: grant.termina_em,
      serverNow: Date.now(),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
  return grant.status === "ATIVO"
    ? response
    : clearTemporaryAccessCookie(response);
}
