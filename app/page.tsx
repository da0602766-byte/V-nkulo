import Link from "./components/StableLink";
import PublicHeader from "./components/PublicHeader";
import PublicMobileNav from "./components/PublicMobileNav";
import ReceptionExperience from "./components/ReceptionExperience";
import { getSessionUser } from "./lib/local-auth";
import { getPublicCommunities } from "./lib/pilot-data";
import { getPlatformBranding } from "./lib/platform-branding";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function Home() {
  const [user, communities, branding] = await Promise.all([
    getSessionUser(),
    getPublicCommunities(),
    getPlatformBranding(),
  ]);
  if (user && !user.system_owner) {
    redirect("/comunidades");
  }
  const panelHref = user?.system_owner
    ? "/proprietario"
    : user
      ? "/painel"
      : "/login";
  return (
    <main
      className="vinkulo-reception"
      data-platform-theme={branding.themePreset.toLowerCase()}
      data-visual-editor-root
      data-editor-key="landing-page"
      aria-label="VÍNKULO — gestão para igrejas e comunidades"
    >
      <div className="rc-field" aria-hidden="true">
        <i />
        <i />
        <i />
        <svg viewBox="0 0 1200 620" preserveAspectRatio="none">
          <defs>
            <linearGradient id="rc-line-gradient" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor="#33e3ff" />
              <stop offset="1" stopColor="#8b6bff" />
            </linearGradient>
          </defs>
          <path
            d="M -40 470 C 220 360, 380 560, 620 420 S 980 160, 1240 280"
            fill="none"
            stroke="url(#rc-line-gradient)"
            strokeWidth="1.6"
          />
        </svg>
      </div>

      <PublicHeader editorScreen="public:landing" />

      {branding.feedBannerUrl && (
        <section className="landing-banner-stage" data-editor-key="landing-banner">
          <figure className="landing-top-banner">
            <img
              src={branding.feedBannerUrl}
              alt="Pessoas conectadas por uma comunidade"
              loading="eager"
              fetchPriority="high"
            />
          </figure>
        </section>
      )}

      <div className="rc-shell">
        <ReceptionExperience
          communities={communities.map((community) => ({
            id: community.id,
            nome: community.nome,
            slug: community.slug,
            descricao: community.descricao,
            cidade: community.cidade,
            logoUrl: community.logoUrl,
          }))}
          signedIn={Boolean(user)}
          panelHref={panelHref}
        />

        <section
          className="rc-governance"
          id="seguranca"
          data-editor-key="landing-governanca"
        >
          <div>
            <p className="rc-eyebrow">Entrada responsável</p>
            <h2>Cada comunidade começa com identidade e acesso definidos.</h2>
            <p>
              Cada nova comunidade passa por análise do proprietário. O envio da
              ficha registra uma solicitação e o espaço só é ativado quando tudo
              estiver pronto.
            </p>
            <ol>
              <li>
                <span>1</span>
                <div>
                  <strong>Envie a solicitação</strong>
                  <small>Identidade e dados institucionais.</small>
                </div>
              </li>
              <li>
                <span>2</span>
                <div>
                  <strong>Análise do proprietário</strong>
                  <small>Revisão, ajustes e decisão auditada.</small>
                </div>
              </li>
              <li>
                <span>3</span>
                <div>
                  <strong>Ativação segura</strong>
                  <small>Comunidade isolada e pronta para configurar.</small>
                </div>
              </li>
            </ol>
          </div>
          <aside>
            <p className="rc-eyebrow">O que é conferido</p>
            <ul>
              <li>
                <b>Identidade e responsável</b>
                <span>Nome, localização e vínculo institucional.</span>
              </li>
              <li>
                <b>Privacidade e acesso</b>
                <span>Visibilidade pública e entrada de membros.</span>
              </li>
              <li>
                <b>Estrutura inicial</b>
                <span>Configurações seguras e isolamento dos dados.</span>
              </li>
            </ul>
            <Link className="rc-secondary" href={user ? "/comunidades" : "/login"}>
              Solicitar uma comunidade
            </Link>
          </aside>
        </section>

        <section className="rc-final" id="comecar">
          <h2>Pronto para conectar sua comunidade?</h2>
          <p>Leva menos de 3 minutos para criar o espaço e convidar sua equipe.</p>
          <Link className="rc-primary" href={panelHref}>
            {user ? "Abrir meu painel" : "Entrar no VÍNKULO"} →
          </Link>
        </section>

        <footer className="rc-footer">
          <div>
            <strong>VÍNKULO</strong>
            <br />
            <span>Gestão para igrejas e comunidades</span>
          </div>
          <nav>
            <Link href="/privacidade">Privacidade</Link>
            <Link href="/termos">Termos</Link>
            <Link href="/exclusao-de-dados">Exclusão de dados</Link>
            <Link href="/contato">Contato</Link>
            <Link href="/comunidades">Comunidades</Link>
          </nav>
        </footer>
      </div>

      <PublicMobileNav />
    </main>
  );
}
