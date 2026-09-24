import { redirect } from "next/navigation";
import AccessPortal from "../components/AccessPortal";
import { getSessionUser } from "../lib/local-auth";
import { getPilotLoginConfig } from "../lib/pilot-login-config";
import { listTenantMemberships } from "../lib/tenant";
import { safeRelativeReturnPath } from "../lib/safe-return-path";

export const dynamic = "force-dynamic";

/* A aba do navegador dizia "VÍNKULO | Gestão para igrejas e comunidades" —
   o mesmo título da recepção. Quem deixa o login aberto numa aba e volta
   depois precisa reconhecer qual das abas pede a senha. */
export const metadata = {
  title: "Entrar | VÍNKULO",
  description: "Acesse sua conta para acompanhar sua comunidade no VÍNKULO.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{
    erro?: string;
    motivo?: string;
    returnTo?: string;
    auto?: string;
    modo?: string;
  }>;
}) {
  const params = await searchParams;
  if (params.modo === 'cadastro') redirect('/log1');
  const returnTo = safeRelativeReturnPath(params.returnTo, "");
  const user = await getSessionUser();
  if (user) {
    if (returnTo) redirect(returnTo);
    const memberships = await listTenantMemberships(user);
    redirect(memberships.length ? "/painel" : "/comunidades?conta=ativa");
  }
  const config = await getPilotLoginConfig();
  const sessionMessages: Record<string, string> = {
    cookie_ausente:
      "O navegador não manteve a sessão. Tente novamente; se continuar, permita cookies para este site.",
    sessao_invalida: "Sua sessão não é mais válida. Entre novamente.",
    sessao_expirada: "Sua sessão expirou. Entre novamente.",
    usuario_ausente:
      "Este cadastro não está mais disponível. Fale com o administrador.",
  };
  return (
    <AccessPortal
      initialMessage={
        params.erro || sessionMessages[params.motivo || ""] || ""
      }
      siteName={config.siteName}
      logoUrl={config.logoUrl}
      returnTo={returnTo}
    />
  );
}
