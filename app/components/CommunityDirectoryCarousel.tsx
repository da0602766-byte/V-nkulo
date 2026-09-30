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
    <section
      className="directory-community-showcase"
      aria-label="Perfis das comunidades"
      aria-roledescription="carrossel"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocusCapture={() => setFocused(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false);
      }}
    >
      <div className="directory-carousel-viewport" aria-live={rotating ? "off" : "polite"} aria-atomic="true" onTouchStart={() => setPaused(true)}>
        <article className="directory-community-profile" key={community.id}>
          <div className="directory-profile-visual">
            {community.bannerUrl ? (
              <SafeImage loading="lazy" src={community.bannerUrl} alt="" />
            ) : (
              <span className="directory-profile-placeholder" aria-hidden="true" />
            )}
            <div className="directory-profile-identity">
              <span className="directory-profile-avatar">
                {community.logoUrl ? <SafeImage loading="lazy" src={community.logoUrl} alt="" /> : community.nome.slice(0, 1)}
              </span>
              <p><small>COMUNIDADE</small><strong>{community.nome}</strong></p>
            </div>
          </div>
          <div className="directory-profile-content">
            <p className="directory-profile-location"><PublicIcon name="pin" size={16} /> {community.cidade || "Localização não informada"}</p>
            <h2>{community.nome}</h2>
            <p className="directory-profile-description">{community.descricao}</p>
            <dl className="directory-profile-facts">
              <div><dt>Próximos eventos</dt><dd>{community.eventosPublicos}</dd></div>
              <div><dt>Acesso</dt><dd>Protegido</dd></div>
            </dl>
            <Link className="directory-profile-action" href={`/comunidades/${community.slug}`}>
              Conhecer a comunidade <PublicIcon name="arrow" size={17} />
            </Link>
          </div>
        </article>
      </div>

      {communities.length > 1 && (
        <footer className="directory-carousel-controls">
          <button type="button" onClick={() => select(activeIndex - 1)} aria-label="Comunidade anterior">←</button>
          <div className="directory-carousel-progress" aria-label={`Comunidade ${activeIndex + 1} de ${communities.length}`}>
            {communities.map((item, index) => (
              <button
                type="button"
                key={item.id}
                className={index === activeIndex ? "active" : ""}
                onClick={() => select(index)}
                aria-label={`Mostrar ${item.nome}`}
                aria-current={index === activeIndex ? "true" : undefined}
              />
            ))}
          </div>
          <span>{activeIndex + 1} / {communities.length}</span>
          <button type="button" onClick={() => select(activeIndex + 1)} aria-label="Próxima comunidade">→</button>
          {!reducedMotion && (
            <button type="button" className="directory-carousel-pause" aria-label={paused ? "Continuar rotação automática" : "Pausar rotação automática"} aria-pressed={paused} onClick={() => setPaused((current) => !current)}>
              {paused ? "Continuar" : "Pausar"}
            </button>
          )}
        </footer>
      )}
    </section>
  );
}
