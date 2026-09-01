"use client";

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
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(media.matches);
    update();
    media.addEventListener?.("change", update);
    return () => media.removeEventListener?.("change", update);
  }, []);

  useEffect(() => {
    if (communities.length < 2 || paused || reducedMotion) return;
    const timer = window.setInterval(() => {
      setActiveIndex((current) => (current + 1) % communities.length);
    }, ROTATION_INTERVAL);
    return () => window.clearInterval(timer);
  }, [communities.length, paused, reducedMotion]);

  const select = (index: number) => {
    setActiveIndex((index + communities.length) % communities.length);
  };
  const community = communities[activeIndex] || communities[0];
  if (!community) return null;

  return (
    <section
      className="directory-community-showcase"
      aria-label="Perfis das comunidades"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setPaused(false);
      }}
      onTouchStart={() => setPaused(true)}
    >
      <div className="directory-carousel-viewport" aria-live={paused ? "polite" : "off"}>
        <article className="directory-community-profile" key={community.id}>
          <div className="directory-profile-visual">
            {community.bannerUrl ? (
              <img loading="lazy" src={community.bannerUrl} alt="" />
            ) : (
              <span className="directory-profile-placeholder" aria-hidden="true" />
            )}
            <div className="directory-profile-identity">
              <span className="directory-profile-avatar">
                {community.logoUrl ? <img loading="lazy" src={community.logoUrl} alt="" /> : community.nome.slice(0, 1)}
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
            <button type="button" className="directory-carousel-pause" onClick={() => setPaused((current) => !current)}>
              {paused ? "Continuar" : "Pausar"}
            </button>
          )}
        </footer>
      )}
    </section>
  );
}
