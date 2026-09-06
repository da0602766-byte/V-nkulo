import { notFound } from "next/navigation";
import JoinCommunityCard from "../../components/JoinCommunityCard";
import PublicHeader from "../../components/PublicHeader";
import PublicMobileNav from "../../components/PublicMobileNav";
import PublicIcon from "../../components/PublicIcon";
import PublicEventRegistration from "../../components/PublicEventRegistration";
import PublicCellRequest from "../../components/PublicCellRequest";
import { getSessionUser } from "../../lib/local-auth";
import {
  getCommunityJoinState,
  getPublicCommunityBySlug,
  getPublicCommunityEvents,
  getPublicCommunityCells,
} from "../../lib/pilot-data";

export const dynamic = "force-dynamic";

// Sem isto toda página pública herda o título do layout, e o perfil de uma
// comunidade fica indistinguível da home numa aba, num favorito ou no
// resultado de uma busca.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const community = await getPublicCommunityBySlug(slug);
  if (!community) return { title: "Comunidade não encontrada | VÍNKULO" };
  const descricao =
    community.descricao?.trim() ||
    `Página pública de ${community.nome}${community.cidade ? ` em ${community.cidade}` : ""}.`;
  return {
    title: `${community.nome} | VÍNKULO`,
    description: descricao.slice(0, 300),
  };
}

export default async function PublicCommunityPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const community = await getPublicCommunityBySlug(slug);
  if (!community) notFound();
  const user = await getSessionUser();
  const [events, cells, joinState] = await Promise.all([
    getPublicCommunityEvents(community.id),
    getPublicCommunityCells(community.id),
    getCommunityJoinState(user?.id || null, community.id),
  ]);
  return (
    <main className="vinkulo-site public-community social-public-community" data-ui-version="v2">
      <PublicHeader />
      <section className="community-profile-shell">
        <div
          className={`community-profile-cover ${community.bannerUrl ? "has-image" : ""}`}
          role="img"
          aria-label={community.bannerUrl ? `Capa da comunidade ${community.nome}` : `Identidade da comunidade ${community.nome}`}
        >
          {community.bannerUrl && (
            <img src={community.bannerUrl} loading="lazy" alt="" />
          )}
        </div>
        <div className="community-profile-identity-v120">
          <span className="community-public-avatar" aria-hidden="true">
            {community.logoUrl ? <img loading="lazy" src={community.logoUrl} alt="" /> : community.nome.slice(0, 1)}
          </span>
          <div className="community-profile-copy">
            <p className="pilot-kicker">PÁGINA PÚBLICA DA COMUNIDADE</p>
            <h1>{community.nome}</h1>
          </div>
          <p className="community-profile-description">{community.descricao}</p>
          <dl className="community-profile-quick-info">
            <div><dt>Localização</dt><dd>{community.cidade || "Não informada"}</dd></div>
            <div><dt>Perfil público</dt><dd>Dados institucionais</dd></div>
            <div><dt>Acesso interno</dt><dd>Somente após aprovação</dd></div>
          </dl>
        </div>
      </section>

      <section className="community-public-main">
        <div className="community-public-about">
          <header className="community-section-heading">
            <div>
              <p className="pilot-kicker">SOBRE A COMUNIDADE</p>
              <h2>Um espaço para conhecer antes de solicitar entrada</h2>
            </div>
            <span>Conteúdo interno protegido</span>
          </header>
          <article className="community-institutional-card community-profile-information">
            <header><span aria-hidden="true"><PublicIcon name="community" size={20} /></span><div><small>APRESENTAÇÃO</small><h3>{community.nome}</h3></div></header>
            <p>{community.descricao || "Esta comunidade ainda está completando sua apresentação institucional."}</p>
            <dl>
              <div><dt>Localização</dt><dd>{community.cidade || "Não informada"}</dd></div>
              <div><dt>Entrada</dt><dd>Solicitação analisada pela comunidade</dd></div>
              <div><dt>Privacidade</dt><dd>Dados pessoais e atividades internas permanecem protegidos</dd></div>
            </dl>
          </article>
        </div>
        <aside className="community-public-side">
          <JoinCommunityCard
            communityId={community.id}
            isSignedIn={Boolean(user)}
            isMember={joinState.isMember}
            initialStatus={joinState.requestStatus}
          />
          <section>
            <p className="pilot-kicker">PRIVACIDADE</p>
            <h2>O que continua privado</h2>
            <ul>
              <li>Membros e dados pessoais</li>
              <li>Publicações e comunicados internos</li>
              <li>Conteúdo interno das células, escalas e atendimentos</li>
              <li>Conteúdo não marcado como público</li>
            </ul>
          </section>
        </aside>
      </section>

      <section className="public-events-section">
        <header>
          <div>
            <p className="pilot-kicker">AGENDA PÚBLICA</p>
            <h2>Próximos eventos</h2>
          </div>
          <span>Somente eventos marcados como públicos</span>
        </header>
        {events.length ? (
          <div className="public-events-grid">
            {events.map((event) => (
              <article key={event.id} id={`evento-${event.id}`}>
                <time dateTime={event.iniciaEm}>
                  <strong>{formatDay(event.iniciaEm)}</strong>
                  <span>{formatMonth(event.iniciaEm)}</span>
                </time>
                <div>
                  <small>{event.categoria.replaceAll("_", " ")}</small>
                  <h3>{event.titulo}</h3>
                  <p>{event.descricao || "Mais informações em breve."}</p>
                  <span>
                    {formatDateTime(event.iniciaEm)}
                    {event.local ? ` · ${event.local}` : ""}
                  </span>
                  <PublicEventRegistration
                    eventId={event.id}
                    eventTitle={event.titulo}
                    isSignedIn={Boolean(user)}
                    isMember={joinState.isMember}
                    userName={user?.nome}
                    userEmail={user?.email}
                  />
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="pilot-empty-state">
            <strong>Nenhum evento público agendado</strong>
            <p>Rascunhos e eventos internos nunca aparecem aqui.</p>
          </div>
        )}
      </section>

      {cells.length > 0 && <section className="public-cells-section-v2">
        <header><div><p className="pilot-kicker">CÉLULAS ABERTAS</p><h2>Encontre uma comunidade perto de você</h2></div><span>Informações autorizadas pela liderança</span></header>
        <div className="public-cells-grid-v2">{cells.map((cell) => <article key={cell.id}><header><span aria-hidden="true">⌂</span><div><small>{cell.dias.map((day) => ({DOM:"Dom",SEG:"Seg",TER:"Ter",QUA:"Qua",QUI:"Qui",SEX:"Sex",SAB:"Sáb"}[day] || day)).join(" · ")}</small><h3>{cell.nome}</h3></div></header><p>{cell.descricao}</p><dl><div><dt>Local</dt><dd>{cell.endereco || "Consulte a liderança"}</dd></div><div><dt>Liderança</dt><dd>{cell.lider}</dd></div><div><dt>Participantes</dt><dd>{cell.membros}</dd></div></dl>{cell.proximoEncontro && <time dateTime={cell.proximoEncontro}>Próximo: {formatDateTime(cell.proximoEncontro)}</time>}<PublicCellRequest cellId={cell.id} cellName={cell.nome} userName={user?.nome} userEmail={user?.email} /></article>)}</div>
      </section>}
      <PublicMobileNav active="communities" />
    </main>
  );
}

function formatDay(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(value));
}

function formatMonth(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    month: "short",
    timeZone: "America/Sao_Paulo",
  })
    .format(new Date(value))
    .replace(".", "")
    .toUpperCase();
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(value));
}
