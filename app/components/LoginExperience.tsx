"use client";

import { useId, useRef, useState, type PointerEvent, type ReactNode } from "react";
import Link from "./StableLink";
import VinkuloMark from "./VinkuloMark";
import { useThemePreference } from "../lib/use-theme-preference";
import "./login-experience.css";

const connections = [
  { name: "Pessoas", word: "conecta", title: "Cada pessoa faz parte.", text: "Histórias diferentes. Uma comunidade para caminhar junto.", icon: "people" },
  { name: "Encontros", word: "edifica", title: "Estar junto faz a diferença.", text: "Encontros, células e ministérios que aproximam a sua comunidade.", icon: "calendar" },
  { name: "Cuidado", word: "transforma", title: "Pequenos gestos. Vínculos reais.", text: "Acolher, ouvir e acompanhar. O cuidado continua além do encontro.", icon: "heart" },
] as const;

function ConnectionIcon({ kind }: { kind: string }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {kind === "people" ? <><circle cx="9" cy="8" r="3"/><path d="M3 20v-2a6 6 0 0 1 12 0v2M16 5a3 3 0 0 1 0 6m2 3a5 5 0 0 1 3 4v2"/></> : kind === "calendar" ? <><rect x="4" y="5" width="16" height="16" rx="3"/><path d="M8 3v4m8-4v4M4 11h16m-12 5 3 2 5-4"/></> : <path d="M20 5a5 5 0 0 0-8 1 5 5 0 0 0-8-1C-2 11 12 21 12 21S26 11 20 5Z"/>}
  </svg>;
}

/** Public login only: the existing account and owner shells keep their own layout. */
export default function LoginExperience({ children, siteName = "Vínkulo" }: { children: ReactNode; siteName?: string }) {
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const art = useRef<HTMLDivElement>(null);
  const gradientId = useId();
  const { theme, updateTheme } = useThemePreference();
  const connection = connections[active];

  function moveArt(event: PointerEvent<HTMLDivElement>) {
    if (paused || event.pointerType !== "mouse" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    art.current?.style.setProperty("--thread-x", `${((event.clientX - bounds.left) / bounds.width - .5) * 12}px`);
    art.current?.style.setProperty("--thread-y", `${((event.clientY - bounds.top) / bounds.height - .5) * 10}px`);
  }

  function resetArt() {
    art.current?.style.removeProperty("--thread-x");
    art.current?.style.removeProperty("--thread-y");
  }

  return <main className="vk-login" data-paused={paused} data-connection={active}>
    <aside className="vk-login-story" aria-label="O que nos conecta">
      <Link href="/" className="vk-login-brand" aria-label={`${siteName} — início`}>
        <VinkuloMark size={60}/><span>{siteName}<small>CONECTA. EDIFICA. TRANSFORMA.</small></span>
      </Link>
      <div className="vk-login-intro">
        <span className="vk-login-kicker"><i aria-hidden="true"/> A VIDA ACONTECE EM COMUNIDADE</span>
        <h2>Você faz parte.<br/>E isso muda <em>tudo.</em></h2>
        <p>A fé nos aproxima. O cuidado nos une.<br/>O próximo vínculo começa com você.</p>
      </div>

      <div className="vk-login-art" onPointerMove={moveArt} onPointerLeave={resetArt}>
        <div className="vk-login-art-plane" ref={art}>
          <div className="vk-login-orbit vk-login-orbit-outer"/><div className="vk-login-orbit vk-login-orbit-inner"/>
          <svg className="vk-login-thread" viewBox="0 0 600 340" fill="none" aria-hidden="true">
            <defs><linearGradient id={gradientId} x1="100" y1="90" x2="490" y2="300" gradientUnits="userSpaceOnUse"><stop stopColor="#cfa7ff"/><stop offset=".5" stopColor="#8874f7"/><stop offset="1" stopColor="#64e3dc"/></linearGradient></defs>
            <path className="vk-login-thread-guide" d="M60 175C140 20 222 320 300 173S470 35 540 175M60 175C135 330 225 25 300 173S465 320 540 175"/>
            <path className="vk-login-thread-shadow" d="M300 290C255 249 139 166 159 108C181 40 270 57 300 112C330 57 419 40 441 108C461 166 345 249 300 290Z" stroke={`url(#${gradientId})`}/>
            <path className="vk-login-thread-heart" d="M300 290C255 249 139 166 159 108C181 40 270 57 300 112C330 57 419 40 441 108C461 166 345 249 300 290Z" stroke={`url(#${gradientId})`} pathLength="100"/>
            <path className="vk-login-thread-spark" d="M300 290C255 249 139 166 159 108C181 40 270 57 300 112C330 57 419 40 441 108C461 166 345 249 300 290Z" pathLength="100"/>
            <path className="vk-login-cross" d="M300 146V213M277 168H323"/>
            <circle cx="159" cy="108" r="6" fill="#e6cfff"/><circle cx="441" cy="108" r="6" fill="#94eeeb"/><circle cx="300" cy="290" r="5" fill="#b4a6ff"/>
          </svg>
          <span className="vk-login-art-label"><span/> um vínculo {connection.word}</span>
          <span className="vk-login-satellite vk-login-satellite-one"><ConnectionIcon kind="people"/></span>
          <span className="vk-login-satellite vk-login-satellite-two"><ConnectionIcon kind="heart"/></span>
          <span className="vk-login-star vk-login-star-one">✦</span><span className="vk-login-star vk-login-star-two">✦</span>
        </div>
      </div>

      <div className="vk-login-explore">
        <div className="vk-login-connections" role="group" aria-label="Explore os vínculos da plataforma">
          {connections.map((item, index) => <button type="button" key={item.name} aria-pressed={active === index} onClick={() => setActive(index)}><ConnectionIcon kind={item.icon}/>{item.name}</button>)}
        </div>
        <div className="vk-login-connection-copy" aria-live="polite" aria-atomic="true"><strong>{connection.title}</strong><p>{connection.text}</p></div>
      </div>
      <div className="vk-login-story-footer"><span>Pessoas. Fé. Pertencimento.</span><button type="button" onClick={() => { resetArt(); setPaused(value => !value); }} aria-pressed={paused} aria-label={paused ? "Retomar animações" : "Pausar animações"}><span aria-hidden="true">{paused ? "▷" : "Ⅱ"}</span><span className="vk-login-motion-label">{paused ? "Retomar" : "Pausar"} animações</span></button></div>
    </aside>

    <section className="vk-login-content" aria-label="Acesse sua conta">
      <nav className="vk-login-toolbar" aria-label="Preferências de exibição"><Link href="/">Conheça o Vínkulo <span aria-hidden="true">↗</span></Link><div className="vk-login-theme">{(["CLARO", "AUTO", "ESCURO"] as const).map((value, index) => <button type="button" key={value} title={`Tema ${["claro", "automático", "escuro"][index]}`} aria-label={`Tema ${["claro", "automático", "escuro"][index]}`} aria-pressed={theme === value} onClick={() => updateTheme(value)}>{["☀", "◐", "☾"][index]}</button>)}</div></nav>
      <div className="vk-login-form-wrap"><div className="vk-login-welcome-icon" aria-hidden="true"><ConnectionIcon kind="heart"/><span>+</span></div>{children}</div>
      <footer className="vk-login-footer"><button type="button" onClick={() => window.dispatchEvent(new Event("vinkulo:open-help"))}>Precisa de ajuda? <span aria-hidden="true">↗</span></button><div><Link href="/termos">Termos de uso</Link><span>·</span><Link href="/privacidade">Privacidade</Link></div><small>Feito para aproximar. © {new Date().getFullYear()} {siteName}</small></footer>
    </section>
  </main>;
}
