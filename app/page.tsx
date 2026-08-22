import Link from "./components/StableLink";
import CreateCommunityShortcut from "./components/CreateCommunityShortcut";
import PublicHeader from "./components/PublicHeader";
import PublicMobileNav from "./components/PublicMobileNav";
import { getSessionUser } from "./lib/local-auth";
import { getPublicCommunities } from "./lib/pilot-data";
import { getPlatformBranding } from "./lib/platform-branding";
import PublicIcon from "./components/PublicIcon";

export const dynamic = "force-dynamic";

const FEATURES = [
  ["users", "Pessoas e vínculos", "Membros, visitantes, perfis e permissões com contexto por comunidade."],
  ["layers", "Ministérios e escalas", "Equipes, funções, checklists e confirmações organizadas por ministério."],
  ["calendar", "Eventos organizados", "Agenda, inscrições, comunicação e acompanhamento de participação."],
  ["message", "Comunicação que aproxima", "Feed, avisos e notificações para manter todos no mesmo ritmo."],
  ["sparkles", "IA com revisão", "Rascunhos e sugestões com aprovação humana antes de qualquer publicação."],
] as const;

export default async function Home() {
  const [user, communities, branding] = await Promise.all([
    getSessionUser(),
    getPublicCommunities(),
    getPlatformBranding(),
  ]);
  return (
    <main
      className="vinkulo-site commercial-landing"
      data-platform-theme={branding.themePreset.toLowerCase()}
      data-visual-editor-root
      data-editor-key="landing-page"
      aria-label="VÍNKULO — gestão para igrejas e comunidades"
    >
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

      <section
        className="landing-hero"
        data-editor-key="landing-hero"
      >
        <div className="landing-hero-copy">
          <p className="landing-status-badge"><span /> Gestão, conexão e cuidado em um só lugar</p>
          <h1>
            A plataforma completa para <span>cuidar, conectar e organizar.</span>
          </h1>
          <p>
            Uma recepção simples para quem participa e ferramentas completas
            para quem lidera comunidades, ministérios e equipes.
          </p>
          <div className="landing-actions">
            <Link className="landing-primary-action" href={user ? "/painel" : "/login"}>
              {user ? "Acessar meu painel" : "Entrar no VÍNKULO"}
              <PublicIcon name="arrow" size={18} />
            </Link>
            <Link className="landing-secondary-action" href="/comunidades">
              <PublicIcon name="search" size={18} />
              Encontrar uma comunidade
            </Link>
          </div>
          <div className="landing-trust-row" aria-label="Diferenciais da plataforma">
            <div><span><PublicIcon name="shield" size={17} /></span><p><strong>Seguro por contexto</strong><small>Dados isolados por comunidade</small></p></div>
            <div><span><PublicIcon name="users" size={17} /></span><p><strong>Feito para pessoas</strong><small>Do visitante à liderança</small></p></div>
            <div><span><PublicIcon name="layers" size={17} /></span><p><strong>Funciona em qualquer tela</strong><small>Celular, tablet e computador</small></p></div>
          </div>
        </div>
        <div className="landing-product-preview" aria-label="Resumo visual do VÍNKULO">
          <div className="landing-preview-label"><span /> VISUAL DEMONSTRATIVO</div>
          <div className="landing-preview-window">
            <header><span>V</span><strong>Painel da comunidade</strong><small>Visão geral</small><i /></header>
            <section>
              <aside>
                {["Início", "Pessoas", "Ministérios", "Eventos", "Escalas"].map((item, index) => (
                  <span className={index === 0 ? "active" : ""} key={item}><i />{item}</span>
                ))}
              </aside>
              <div>
                <div className="landing-preview-heading"><div><h2>Olá, equipe!</h2><p>O essencial da sua comunidade, hoje.</p></div><b>Atualizado agora</b></div>
                <div className="landing-preview-stats">
                  <article><small>Pessoas conectadas</small><strong>624</strong><span>+18 este mês</span></article>
                  <article><small>Próximos eventos</small><strong>14</strong><span>agenda organizada</span></article>
                  <article><small>Escalas abertas</small><strong>6</strong><span>confirmações pendentes</span></article>
                </div>
                <div className="landing-preview-chart"><header><strong>Participação da comunidade</strong><small>Últimos 6 meses</small></header><div><span /><span /><span /><span /><span /><span /></div></div>
              </div>
            </section>
          </div>
          <div className="landing-phone-preview" aria-hidden="true">
            <header><span>V</span><i /><i /></header><strong>Próximas atividades</strong><p /><p /><p /><b>+</b>
          </div>
          <div className="landing-preview-notice" aria-hidden="true"><span><PublicIcon name="calendar" size={17} /></span><div><strong>Escala confirmada</strong><small>Tudo certo para domingo</small></div></div>
        </div>
      </section>

      <section id="recursos" className="landing-features" data-editor-key="landing-recursos">
        <header>
          <div><p className="landing-eyebrow">RECURSOS ESSENCIAIS</p><h2>Menos telas soltas. Mais clareza para servir.</h2></div>
          <p>O VÍNKULO reúne as rotinas da comunidade sem perder simplicidade para quem só precisa participar.</p>
        </header>
        <div>
          {FEATURES.map(([icon, title, description]) => (
            <article key={title}>
              <span><PublicIcon name={icon} size={21} /></span>
              <h3>{title}</h3>
              <p>{description}</p>
              <i aria-hidden="true"><PublicIcon name="arrow" size={17} /></i>
            </article>
          ))}
        </div>
      </section>

      <section id="seguranca" className="landing-governance" data-editor-key="landing-governanca">
        <div>
          <p className="landing-eyebrow">ENTRADA RESPONSÁVEL</p>
          <h2>Cada comunidade começa com identidade e acesso bem definidos.</h2>
          <p>
            Cada nova comunidade passa por análise do proprietário. O envio da
            ficha registra uma solicitação e o espaço só é ativado quando tudo
            estiver pronto.
          </p>
          <ol>
            <li><span>1</span><div><strong>Envie a solicitação</strong><small>Identidade e dados institucionais.</small></div></li>
            <li><span>2</span><div><strong>Análise do proprietário</strong><small>Revisão, ajustes e decisão auditada.</small></div></li>
            <li><span>3</span><div><strong>Ativação segura</strong><small>Comunidade isolada e pronta para configurar.</small></div></li>
          </ol>
        </div>
        <aside className="landing-governance-side">
          <div className="landing-governance-review">
            <p className="landing-eyebrow">O QUE É CONFERIDO</p>
            <h3>Uma análise clara antes da ativação.</h3>
            <ul>
              <li><span>✓</span><div><strong>Identidade e responsável</strong><small>Nome, localização e vínculo institucional.</small></div></li>
              <li><span>✓</span><div><strong>Privacidade e acesso</strong><small>Visibilidade pública e entrada de membros.</small></div></li>
              <li><span>✓</span><div><strong>Estrutura inicial</strong><small>Configurações seguras e isolamento dos dados.</small></div></li>
            </ul>
          </div>
          <CreateCommunityShortcut signedIn={Boolean(user)} />
        </aside>
      </section>

      <section className="landing-community-preview" data-editor-key="landing-comunidades">
        <header>
          <div>
            <p className="landing-eyebrow">COMUNIDADES</p>
            <h2>Conheça páginas institucionais ativas.</h2>
            <p>O diretório mostra apenas informações públicas. Conteúdo interno exige vínculo aprovado.</p>
          </div>
          <Link href="/comunidades">Ver diretório completo</Link>
        </header>
        <div>
          {communities.slice(0, 3).map((community) => (
            <article key={community.id}>
              <span>{community.logoUrl ? <img src={community.logoUrl} alt="" /> : community.nome.slice(0, 1)}</span>
              <div><small>{community.cidade}</small><h3>{community.nome}</h3><p>{community.descricao}</p></div>
              <Link href={`/comunidades/${community.slug}`}>Conhecer comunidade</Link>
            </article>
          ))}
          {!communities.length && (
            <div className="landing-empty-communities">
              <strong>Diretório em preparação</strong>
              <p>As comunidades aparecerão aqui após ativação pelo proprietário.</p>
            </div>
          )}
        </div>
      </section>

      <section className="landing-final-cta" data-editor-key="landing-cta-final">
        <div><p className="landing-eyebrow">PRONTO PARA COMEÇAR?</p><h2>Um lugar para pertencer. Uma plataforma para organizar.</h2></div>
        <Link href={user?.system_owner ? "/proprietario" : user ? "/painel" : "/login"}>
          {user?.system_owner ? "Abrir Área do Proprietário" : user ? "Abrir meu painel" : "Entrar no VÍNKULO"}
        </Link>
      </section>

      <PublicMobileNav />
      <footer className="landing-footer">
        <strong>VÍNKULO</strong>
        <span>Gestão para igrejas e comunidades</span>
        <nav><Link href="/privacidade">Privacidade</Link><Link href="/termos">Termos</Link><Link href="/comunidades">Comunidades</Link></nav>
      </footer>
    </main>
  );
}
