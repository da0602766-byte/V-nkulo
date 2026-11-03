import GlobalVisualEditor from "./components/GlobalVisualEditorLazy";
import LandingPageExperience from "./components/LandingPageExperience";
import StableLink from "./components/StableLink";
import { getSessionUser } from "./lib/local-auth";
import { getLandingPlans } from "./lib/platform-plans";
import { getPlatformBranding } from "./lib/platform-branding";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function Home({ searchParams }: {
  searchParams?: Promise<{ apresentacao?: string }>;
} = {}) {
  const user = await getSessionUser();
  const params = await searchParams;
  if (user && !user.system_owner && params?.apresentacao !== "1") {
    redirect("/comunidades");
  }
  const panelHref = user?.system_owner
    ? "/proprietario"
    : user
      ? "/painel"
      : "/login";
  const [plans, branding] = await Promise.all([
    getLandingPlans(),
    getPlatformBranding(),
  ]);
  return <>
    <StableLink className="sr-only" href={panelHref}>Abrir painel</StableLink>
    <LandingPageExperience
      signedIn={Boolean(user)}
      panelHref={panelHref}
      canEdit={Boolean(user?.system_owner)}
      plans={plans}
      siteName={branding.siteName}
      logoUrl={branding.logoUrl}
    />
    <GlobalVisualEditor
      canEdit={Boolean(user?.system_owner)}
      communityName="Área pública da plataforma"
      screenId="public:landing"
      surface="public"
      rootSelector=".vinkulo-landing"
    />
  </>;
}
