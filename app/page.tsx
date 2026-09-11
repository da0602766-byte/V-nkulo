import GlobalVisualEditor from "./components/GlobalVisualEditorLazy";
import LandingPageExperience from "./components/LandingPageExperience";
import { getSessionUser } from "./lib/local-auth";
import { getLandingPlans } from "./lib/platform-plans";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await getSessionUser();
  if (user && !user.system_owner) {
    redirect("/comunidades");
  }
  const panelHref = user?.system_owner
    ? "/proprietario"
    : user
      ? "/painel"
      : "/login";
  const plans = await getLandingPlans();
  return <>
    <LandingPageExperience
      signedIn={Boolean(user)}
      panelHref={panelHref}
      canEdit={Boolean(user?.system_owner)}
      plans={plans}
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
