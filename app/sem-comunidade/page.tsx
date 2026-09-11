import Link from "../components/StableLink";
import { redirect } from "next/navigation";
import AccountProfileWorkspace from "../components/AccountProfileWorkspace";
import { getSessionState } from "../lib/local-auth";

export const dynamic = "force-dynamic";

export default async function NoCommunityPage() {
  const session = await getSessionState();
  if (!session.user) redirect(`/login?motivo=${session.reason}`);
  return (
    <main className="no-community-page">
      <header>
        <Link className="vinkulo-brand" href="/">
          <span className="vinkulo-mark" aria-hidden="true">V<i>+</i></span>
          <span><strong>Vínkulo</strong><small>Conta ativa</small></span>
        </Link>
        <a className="no-community-logout" href="/api/auth/logout">Sair</a>
      </header>
      <section className="no-community-intro">
        <p className="pilot-kicker">CONTA SEM COMUNIDADE ATIVA</p>
        <h1>Olá, {session.user.nome}</h1>
        <p>
          Sua conta está ativa. Explore as comunidades públicas e solicite
          entrada quando encontrar a sua.
        </p>
        <Link href="/comunidades">Explorar comunidades</Link>
      </section>
      <AccountProfileWorkspace neutral />
    </main>
  );
}
