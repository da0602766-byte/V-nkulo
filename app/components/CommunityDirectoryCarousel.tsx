"use client";
import SafeImage from "./SafeImage";


import { useEffect, useState } from "react";
import type { PublicCommunity } from "../lib/pilot-data";
import Link from "./StableLink";
import PublicIcon from "./PublicIcon";

const ROTATION_INTERVAL = 6000;

export default function CommunityDirectoryCarousel({
  communities,
}: {
  communities: PublicCommunity[];
}) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [pageVisible, setPageVisible] = useState(true);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(media.matches);
    update();
    media.addEventListener?.("change", update);
    return () => media.removeEventListener?.("change", update);
  }, []);

  useEffect(() => {
    const update = () => setPageVisible(document.visibilityState === "visible");
    update();
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, []);

  const rotating = communities.length > 1 && !paused && !hovered && !focused && !reducedMotion && pageVisible;

  useEffect(() => {
    if (!rotating) return;
    const timer = window.setInterval(() => {
      setActiveIndex((current) => (current + 1) % communities.length);
    }, ROTATION_INTERVAL);
    return () => window.clearInterval(timer);
  }, [communities.length, rotating]);

  const select = (index: number) => {
    setPaused(true);
    setActiveIndex((index + communities.length) % communities.length);
  };
  const community = communities[activeIndex] || communities[0];
  if (!community) return null;

  return (
    <section className="vkd-showcase" aria-label="Perfis das comunidades" aria-roledescription="carrossel"
      onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
      onFocusCapture={() => setFocused(true)} onBlurCapture={(event) => {if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false);}}>
      <aside className="vkd-community-list" aria-label="Selecionar comunidade">
        <p>Comunidades encontradas</p>
        <div className="vkd-community-options">{communities.map((item,index)=><button type="button" key={item.id} onClick={()=>select(index)} aria-label={`Mostrar ${item.nome}`} aria-current={item.id===community.id?'true':undefined}>
          <span className="vkd-list-avatar">{item.logoUrl?<SafeImage loading="lazy" src={item.logoUrl} alt="" fallbackName={item.nome} fallbackKind="avatar"/>:item.nome.slice(0,1)}</span><span><strong>{item.nome}</strong><small>{item.cidade||'Comunidade Vínkulo'}</small></span><PublicIcon name="arrow" size={16}/>
        </button>)}</div>
        {communities.length>1&&<div className="vkd-controls"><button type="button" onClick={()=>select(activeIndex-1)} aria-label="Comunidade anterior">←</button><span aria-label={`Comunidade ${activeIndex+1} de ${communities.length}`}>{activeIndex+1} / {communities.length}</span><button type="button" onClick={()=>select(activeIndex+1)} aria-label="Próxima comunidade">→</button>{!reducedMotion&&<button type="button" className="vkd-pause" aria-label={paused?'Continuar rotação automática':'Pausar rotação automática'} aria-pressed={paused} onClick={()=>setPaused(current=>!current)}>{paused?'Continuar':'Pausar'}</button>}</div>}
      </aside>
      <div className="vkd-profile-region" aria-live={rotating?'off':'polite'} aria-atomic="true" onTouchStart={()=>setPaused(true)}>
        <article className="vkd-profile" key={community.id}>
          <div className="vkd-cover">{community.bannerUrl?<SafeImage loading="lazy" src={community.bannerUrl} alt=""/>:<div className="vkd-cover-art" aria-hidden="true"><PublicIcon name="community" size={64}/></div>}<span className="vkd-cover-label"><PublicIcon name="users" size={14}/> Comunidade Vínkulo</span></div>
          <div className="vkd-profile-body">
            <span className="vkd-profile-avatar">{community.logoUrl?<SafeImage loading="lazy" src={community.logoUrl} alt="" fallbackName={community.nome} fallbackKind="avatar"/>:community.nome.slice(0,1)}</span>
            <p className="vkd-location"><PublicIcon name="pin" size={14}/>{community.cidade||'Localização não informada'}</p>
            <h2>{community.nome}</h2>
            <p className="vkd-description">{community.descricao||'Conheça a página pública e descubra mais sobre esta comunidade.'}</p>
            <footer><span className="vkd-event-count"><PublicIcon name="calendar" size={17}/>{community.eventosPublicos} {community.eventosPublicos===1?'próximo evento':'próximos eventos'}</span><Link className="vkd-profile-action" href={`/comunidades/${community.slug}`}>Conhecer a comunidade <PublicIcon name="arrow" size={17}/></Link></footer>
          </div>
        </article>
      </div>
    </section>
  );
}
