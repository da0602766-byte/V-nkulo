"use client";

import Image from "next/image";
import { type CSSProperties, type PointerEvent, type ReactNode, useEffect, useRef, useState } from "react";
import Link from "./StableLink";
import ThemeControl from "./ThemeControl";
import VinkuloMark from "./VinkuloMark";
import { DEFAULT_LANDING_PLANS, type LandingPlan } from "../lib/platform-plans";

type LandingPageExperienceProps = {
  signedIn: boolean;
  panelHref: string;
  canEdit: boolean;
  plans: LandingPlan[];
  siteName?: string;
  logoUrl?: string;
};


const MODULES = [
  { icon: "thread", label: "Fio do dia", desc: "Veja o que já aconteceu, o que está em andamento e os próximos compromissos.", tone: "blue" },
  { icon: "cells", label: "Células", desc: "Gerencie grupos, acompanhe saúde, relatórios semanais e solicitações de entrada.", tone: "green" },
  { icon: "ministry", label: "Ministérios e escalas", desc: "Monte escalas, notifique voluntários e registre quem participa de cada ministério.", tone: "yellow" },
  { icon: "visitor", label: "Visitantes", desc: "Acolha quem chegou pela primeira vez e acompanhe a jornada de integração.", tone: "rose" },
  { icon: "prayer", label: "Pedidos de oração", desc: "Canal pastoral para pedidos, acompanhamento e resposta com cuidado e discrição.", tone: "purple" },
  { icon: "calendar", label: "Agenda e eventos", desc: "Calendário unificado, convites, confirmações e lembretes automáticos.", tone: "green" },
] as const;

const ROLES = [
  { icon: "leadership", role: "Pastor e liderança", tone: "blue", items: ["Painel executivo da comunidade", "Acompanhamento de células", "Relatórios de crescimento", "Gestão de pessoas e papéis"] },
  { icon: "cells", role: "Líder de célula", tone: "green", items: ["Relatório semanal da célula", "Lista de membros e visitantes", "Aprovações de entrada", "Agenda do grupo"] },
  { icon: "member", role: "Membro", tone: "purple", items: ["Mural e fio do dia", "Ministérios e escalas", "Pedidos de oração", "Reserva de eventos"] },
] as const;

const CURRENT_EVENT = {
  time: "Agora", title: "Reunião de liderança", status: "Em andamento", state: "now",
} as const;

const TIMELINE_EVENTS = [
  { time: "08:30", title: "Culto de oração", status: "Realizado", state: "past" },
  CURRENT_EVENT,
  { time: "19h30", title: "Culto de quarta", status: "Confirmado", state: "future" },
  { time: "Sáb · 10h", title: "Treinamento de líderes", status: "6 confirmados", state: "future" },
] as const;

const NOTIFICATION_EXAMPLES = [
  {
    id: "escalas", label: "Escalas", icon: "ministry", tone: "yellow",
    title: "Você foi escalado para a recepção",
    message: "Domingo, às 9h. Abra a escala para confirmar sua disponibilidade.",
  },
  {
    id: "visitantes", label: "Visitantes", icon: "visitor", tone: "rose",
    title: "Novo visitante para acompanhar",
    message: "Uma visita foi registrada. A equipe de acolhimento pode dar continuidade ao contato.",
  },
  {
    id: "agenda", label: "Agenda", icon: "calendar", tone: "blue",
    title: "Lembrete de reunião",
    message: "A reunião de liderança começa às 19h30.",
  },
] as const;

type DemoView = "timeline" | "notifications";
type NotificationExample = (typeof NOTIFICATION_EXAMPLES)[number];

export { DEFAULT_LANDING_PLANS };

const FAQS = [
  ["Preciso instalar algum aplicativo?", "Não. O Vínkulo funciona diretamente no navegador do celular ou computador, sem instalação. A experiência é otimizada para toque e para telas pequenas."],
  ["Os dados da minha igreja ficam separados de outras?", "Sim. Cada comunidade é um ambiente isolado. Nenhuma outra igreja acessa seus dados operacionais — membros, células, relatórios ou comunicações."],
  ["Posso usar a cor da minha igreja no sistema?", "A personalização depende dos recursos liberados para a sua comunidade. Consulte as condições da proposta."],
  ["Como é o suporte?", "O responsável pela plataforma informa o canal de atendimento ao analisar sua solicitação."],
  ["Posso cancelar quando quiser?", "As condições de duração e encerramento constam na proposta apresentada antes da contratação."],
] as const;

export default function LandingPageExperience({ signedIn, panelHref, canEdit, plans, siteName = "Vínkulo", logoUrl = "" }: LandingPageExperienceProps) {
  const root = useRef<HTMLElement>(null);
  const themeTransition = useRef(0);
  const [activeFaq, setActiveFaq] = useState<number | null>(null);
  const [demoView, setDemoView] = useState<DemoView>("timeline");
  const signupHref = signedIn ? panelHref : "/log1";

  useEffect(() => {
    // Streaming can finish after the browser's initial fragment navigation.
    const frame = requestAnimationFrame(() => {
      const section = window.location.hash.slice(1);
      if (["recursos", "como-funciona", "fio-do-dia", "planos", "duvidas"].includes(section)) {
        document.getElementById(section)?.scrollIntoView({ block: "start", behavior: "instant" });
      }
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => () => window.clearTimeout(themeTransition.current), []);

  function animateManualThemeChange() {
    const landing = root.current;
    if (!landing || !window.matchMedia("(prefers-reduced-motion: no-preference)").matches) return;

    window.clearTimeout(themeTransition.current);
    landing.classList.add("lp-theme-changing");
    themeTransition.current = window.setTimeout(() => landing.classList.remove("lp-theme-changing"), 500);
  }

  useEffect(() => {
    const landing = root.current;
    if (!landing || typeof IntersectionObserver === "undefined" || !window.matchMedia("(prefers-reduced-motion: no-preference)").matches) return;

    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      }
    }, { threshold: 0.12 });

    for (const item of landing.querySelectorAll(".lp-reveal")) observer.observe(item);
    return () => observer.disconnect();
  }, []);

  return (
    <main ref={root} className="vinkulo-site vinkulo-reception vinkulo-landing" data-visual-editor-root data-editor-key="landing-page" aria-label="VÍNKULO — gestão para igrejas e comunidades">
      <nav className="lp-nav" aria-label="Navegação principal">
        <div className="lp-shell lp-nav-inner">
          <Link className="lp-brand" href="/" aria-label={`${siteName} — início`}><VinkuloMark logoUrl={logoUrl} size={40} /><span>{siteName}</span></Link>
          <div className="lp-nav-links">
            <a href="#recursos">Recursos</a><a href="#fio-do-dia">Fio do dia</a>{canEdit ? <a href="#planos">Planos</a> : <Link href="/planos">Planos</Link>}<a href="#duvidas">Dúvidas</a>
          </div>
          <div className="lp-nav-actions">
            <ThemeControl compact cycle onManualChange={animateManualThemeChange} />
            {canEdit && <span id="global-editor-toolbar-slot" className="global-editor-toolbar-slot" aria-label="Aparência" />}
            <Link className="lp-button lp-button-small" href={signedIn ? "/painel" : "/login"} showLoading>{signedIn ? "Abrir painel" : "Entrar"}</Link>
          </div>
        </div>
      </nav>

      <section className="lp-hero">
        <div className="lp-shell lp-hero-content">
          <div className="lp-hero-copy">
            <p className="lp-section-label">Gestão para igrejas</p>
            <h1>Tudo que sua <em>comunidade</em> precisa, conectado.</h1>
            <p className="lp-hero-description">Células, ministérios, escalas, visitantes e pedidos de oração em uma plataforma feita para igrejas brasileiras.</p>
            <div className="lp-hero-actions">
              <Link className="lp-button" href={signupHref} showLoading>{signedIn ? "Abrir meu painel" : "Solicitar comunidade"}</Link>
              <a className="lp-button lp-button-secondary" href="#fio-do-dia" onClick={() => setDemoView("timeline")}>Ver demonstração</a>
            </div>
          </div>
          <figure className="lp-hero-visual" onPointerMove={moveHeroLight}>
            <Image
              src="/landing-comunidade.webp"
              alt="Pessoas de diferentes gerações conversam em uma igreja"
              width={1120}
              height={1400}
              loading="eager"
              fetchPriority="high"
              unoptimized
            />
            <figcaption className="lp-hero-preview">
              <a href="#fio-do-dia" onClick={() => setDemoView("notifications")}>
                <span className="lp-hero-preview-icon"><FeatureIcon name="bell" /></span>
                <span className="lp-hero-preview-copy"><span>Demonstração interativa</span><strong>Simular notificações</strong></span>
              </a>
            </figcaption>
          </figure>
        </div>
      </section>

      <section className="lp-section lp-shell" id="recursos">
        <Reveal className="lp-section-heading"><SectionLabel>Recursos</SectionLabel><h2>Cada área da sua igreja, <em>organizada</em></h2><p>Pastores, líderes e membros encontram as ferramentas do dia a dia em um só lugar.</p></Reveal>
        <div className="lp-module-grid">{MODULES.map((module, index) => <Reveal key={module.label} delay={(index % 3) * 65}><article className={`lp-module lp-tone-${module.tone}`}><span><FeatureIcon name={module.icon} /></span><h3>{module.label}</h3><p>{module.desc}</p></article></Reveal>)}</div>
      </section>

      <section className="lp-section lp-shell" id="como-funciona" aria-labelledby="como-funciona-titulo">
        <div className="lp-section-heading"><SectionLabel>Como funciona</SectionLabel><h2 id="como-funciona-titulo">Seu lugar na comunidade, <em>passo a passo</em></h2><p>Conheça a comunidade, solicite seu vínculo e acompanhe o que acontece por lá.</p></div>
        <ol className="lp-joining-steps">
          <li><span aria-hidden="true">1</span><h3>Encontre sua comunidade</h3><p>Busque pelo nome ou pela cidade e conheça a página da comunidade.</p><Link href="/comunidades">Explorar comunidades</Link></li>
          <li><span aria-hidden="true">2</span><h3>Solicite sua entrada</h3><p>Entre na sua conta e envie a solicitação na página da comunidade. A equipe responsável analisa seu vínculo.</p><Link href={signedIn ? "/comunidades" : "/login"}>{signedIn ? "Encontrar minha comunidade" : "Entrar na minha conta"}</Link></li>
          <li><span aria-hidden="true">3</span><h3>Participe do dia a dia</h3><p>Após a aprovação, acompanhe o mural, a agenda e as áreas disponíveis para o seu perfil.</p><Link href={panelHref}>Abrir meu painel</Link></li>
        </ol>
      </section>

      <section className="lp-section lp-thread-section" id="fio-do-dia">
        <div className="lp-shell lp-thread-layout">
          <Reveal className="lp-thread-copy"><SectionLabel>O Fio do dia</SectionLabel><h2>A linha do tempo da <em>sua comunidade</em></h2><p>Veja o que já aconteceu, o que está em andamento e o que vem a seguir. Experimente também os avisos de escalas, visitantes e agenda.</p></Reveal>
          <Reveal delay={90}><LandingDemo view={demoView} onViewChange={setDemoView} /></Reveal>
        </div>
      </section>

      <section className="lp-section lp-shell">
        <Reveal className="lp-section-heading lp-centered"><SectionLabel>Para quem é</SectionLabel><h2>A visão certa para <em>cada papel</em></h2></Reveal>
        <div className="lp-role-grid">{ROLES.map((role, index) => <Reveal key={role.role} delay={index * 65}><article className={`lp-role lp-tone-${role.tone}`}><header><span><FeatureIcon name={role.icon} /></span><h3>{role.role}</h3></header><ul>{role.items.map((item) => <li key={item}>{item}</li>)}</ul></article></Reveal>)}</div>
      </section>

      {canEdit && <section className="lp-section lp-shell" id="planos" data-editor-key="landing-governanca">
        <Reveal className="lp-section-heading lp-centered"><SectionLabel>Planos</SectionLabel><h2>Simples e <em>transparente</em></h2><p>Planos configurados para as necessidades da sua comunidade.</p></Reveal>
        <div className="lp-plan-grid">{plans.map((plan, index) => <Reveal key={plan.name} delay={(index % 3) * 65}><article className={plan.featured ? "featured" : ""}>{plan.featured && <span className="lp-popular">Destaque</span>}<h3>{plan.name}</h3><div className="lp-price"><strong>{plan.price}</strong>{plan.period && <span>{plan.period}</span>}</div><p>{plan.description}</p><ul>{plan.items.map((item) => <li key={item}><CheckIcon />{item}</li>)}</ul><Link className={`lp-button ${plan.featured ? "" : "lp-button-secondary"}`} href="/log1" showLoading>{plan.cta}</Link></article></Reveal>)}</div>
        <p className="lp-owner-plan-note">Esta prévia é exclusiva do proprietário. <Link href="/proprietario?tab=plans">Configurar planos e chamadas</Link></p>
      </section>}

      <section className="lp-section lp-faq lp-shell" id="duvidas">
        <Reveal className="lp-section-heading lp-centered"><SectionLabel>Dúvidas</SectionLabel><h2>Perguntas frequentes</h2></Reveal>
        <div className="lp-faq-list">{FAQS.map(([question, answer], index) => <article key={question}><button type="button" aria-expanded={activeFaq === index} aria-controls={`faq-${index}`} onClick={() => setActiveFaq(activeFaq === index ? null : index)}><span>{question}</span><i aria-hidden="true">+</i></button><div id={`faq-${index}`} hidden={activeFaq !== index}><p>{answer}</p></div></article>)}</div>
      </section>

      <section className="lp-final">
        <Reveal className="lp-shell">
          <span className="lp-final-art" aria-hidden="true" />
          <h2>Traga sua comunidade para o <span className="lp-final-name">Vínkulo</span></h2>
          <p>Conheça os planos e envie sua solicitação.</p>
          <Link className="lp-button lp-button-white" href={signupHref} showLoading>
            {signedIn ? "Abrir meu painel" : "Solicitar minha comunidade"}
          </Link>
        </Reveal>
      </section>

      <footer className="lp-footer"><div className="lp-shell"><div className="lp-footer-main"><div><Link className="lp-brand" href="/" aria-label={`${siteName} — início`}><VinkuloMark logoUrl={logoUrl} size={40} /><span>{siteName}</span></Link><p>Plataforma de gestão para igrejas e comunidades em português do Brasil.</p></div><nav aria-label="Links institucionais"><Link href="/planos">Planos</Link><Link href="/termos">Termos de uso</Link><Link href="/privacidade">Privacidade</Link><Link href="/contato">Suporte</Link><Link href="/comunidades">Comunidades</Link></nav></div><div className="lp-footer-bottom"><span>© 2026 Vínkulo</span><span>Feito com cuidado para igrejas brasileiras</span></div></div></footer>
    </main>
  );
}

function Reveal({ children, className = "", delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
  return <div className={`lp-reveal ${className}`} style={{ "--lp-enter-delay": `${delay}ms` } as CSSProperties}>{children}</div>;
}

function moveHeroLight(event: PointerEvent<HTMLElement>) {
  if (event.pointerType !== "mouse") return;
  const { currentTarget, clientX, clientY } = event;
  const rect = currentTarget.getBoundingClientRect();
  currentTarget.style.setProperty("--lp-light-x", `${clientX - rect.left}px`);
  currentTarget.style.setProperty("--lp-light-y", `${clientY - rect.top}px`);
}

function SectionLabel({ children }: { children: ReactNode }) { return <p className="lp-section-label">{children}</p>; }

function FeatureIcon({ name }: { name: string }) {
  const common = { fill: "none", stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  const paths: Record<string, ReactNode> = {
    thread: <><path d="M12 3v7" /><circle cx="12" cy="12" r="2" fill="currentColor" stroke="none" /><path d="M12 14v7" strokeDasharray="2 2" /></>,
    cells: <><circle cx="12" cy="12" r="2.3" /><circle cx="5" cy="8" r="2" /><circle cx="19" cy="8" r="2" /><circle cx="5" cy="17" r="2" /><circle cx="19" cy="17" r="2" /><path d="m10 11-3.2-2M14 11l3.2-2M10 13l-3.2 3M14 13l3.2 3" /></>,
    ministry: <><rect x="4" y="9" width="16" height="11" rx="2" /><path d="M8 9V6a4 4 0 0 1 8 0v3M12 13v3" /></>,
    visitor: <><circle cx="11" cy="8" r="3" /><path d="M4 21c.5-4 2.8-6 7-6s6.5 2 7 6M18 4l2 2-2 2" /></>,
    prayer: <><path d="M12 3S6 7 6 12a6 6 0 0 0 12 0c0-5-6-9-6-9Z" /><path d="M12 8v8M9 12h6" /></>,
    bell: <><path d="M5 17h14l-2-3V9a5 5 0 0 0-10 0v5l-2 3Z" /><path d="M10 21h4" /></>,
    calendar: <><rect x="4" y="6" width="16" height="14" rx="2" /><path d="M8 3v5M16 3v5M4 11h16M8 15h.01M12 15h.01M16 15h.01" /></>,
    leadership: <><path d="m12 3 2.4 4.8 5.3.8-3.8 3.7.9 5.3-4.8-2.5-4.8 2.5.9-5.3-3.8-3.7 5.3-.8L12 3Z" /></>,
    member: <><circle cx="12" cy="8" r="4" /><path d="M4 21c.7-4.5 3.3-7 8-7s7.3 2.5 8 7" /></>,
  };
  return <svg viewBox="0 0 24 24" aria-hidden="true" {...common}>{paths[name]}</svg>;
}

function CheckIcon() { return <svg viewBox="0 0 18 18" aria-hidden="true"><circle cx="9" cy="9" r="8" /><path d="m5.5 9 2.4 2.5 4.7-5" /></svg>; }

function LandingDemo({ view, onViewChange }: { view: DemoView; onViewChange: (view: DemoView) => void }) {
  return (
    <div className="lp-timeline lp-demo">
      <div className="lp-demo-tabs" role="group" aria-label="Demonstração do Vínkulo">
        <button type="button" aria-pressed={view === "timeline"} aria-controls="lp-demo-content" onClick={() => onViewChange("timeline")}>
          <FeatureIcon name="thread" /> Fio do dia
        </button>
        <button type="button" aria-pressed={view === "notifications"} aria-controls="lp-demo-content" onClick={() => onViewChange("notifications")}>
          <FeatureIcon name="bell" /> Notificações
        </button>
      </div>
      <div id="lp-demo-content" className="lp-demo-content" key={view}>
        {view === "timeline" ? <TimelineDemo /> : <NotificationDemo />}
      </div>
    </div>
  );
}

function TimelineDemo() {
  return (
    <>
      <div className="lp-timeline-heading"><FeatureIcon name="thread" /><strong>Exemplo de agenda</strong></div>
      <ol className="lp-timeline-events">
        {TIMELINE_EVENTS.map(({ time, title, status, state }) => (
          <li key={title} className={state}>
            <span className="lp-timeline-marker" aria-hidden="true" />
            <span className="lp-timeline-time">{time}</span>
            <div><strong>{title}</strong><span>{status}</span></div>
          </li>
        ))}
      </ol>
    </>
  );
}

function NotificationDemo() {
  const [selected, setSelected] = useState<NotificationExample>(NOTIFICATION_EXAMPLES[0]);
  const [notice, setNotice] = useState<{ example: NotificationExample; sequence: number } | null>(null);
  const sendButton = useRef<HTMLButtonElement>(null);

  return (
    <div className="lp-notification-demo">
      <p>Escolha um tipo de aviso e veja como ele aparece no painel. Os dados são fictícios.</p>
      <div className="lp-demo-choices" role="group" aria-label="Tipo de aviso">
        {NOTIFICATION_EXAMPLES.map((example) => (
          <button
            key={example.id}
            type="button"
            aria-pressed={selected.id === example.id}
            onClick={() => setSelected(example)}
          >
            {example.label}
          </button>
        ))}
      </div>
      <button
        ref={sendButton}
        className="lp-button lp-demo-send"
        type="button"
        onClick={() => setNotice(previous => ({ example: selected, sequence: (previous?.sequence ?? 0) + 1 }))}
      >
        <FeatureIcon name="bell" /> Simular aviso
      </button>
      <div className="lp-demo-notice-region" role="status" aria-atomic="true">
        {notice && (
          <article className={`lp-demo-notice lp-tone-${notice.example.tone}`} key={notice.sequence}>
            <span className="lp-demo-notice-icon"><FeatureIcon name={notice.example.icon} /></span>
            <div>
              <span className="lp-demo-notice-label">Aviso simulado</span>
              <strong>{notice.example.title}</strong>
              <p>{notice.example.message}</p>
            </div>
            <button
              type="button"
              aria-label="Fechar aviso simulado"
              onClick={() => {
                setNotice(null);
                sendButton.current?.focus();
              }}
            >
              Fechar
            </button>
          </article>
        )}
      </div>
    </div>
  );
}
