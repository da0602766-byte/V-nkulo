"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";
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
  { icon: "thread", label: "Fio do dia", desc: "A linha do tempo da comunidade. Passado sólido, futuro tracejado e o momento certo entre os dois.", tone: "blue" },
  { icon: "cells", label: "Células", desc: "Gerencie grupos, acompanhe saúde, relatórios semanais e solicitações de entrada.", tone: "green" },
  { icon: "ministry", label: "Ministérios e escalas", desc: "Monte escalas, notifique voluntários e registre quem participa de cada ministério.", tone: "yellow" },
  { icon: "visitor", label: "Visitantes", desc: "Acolha quem chegou pela primeira vez e acompanhe a jornada de integração.", tone: "rose" },
  { icon: "prayer", label: "Pedidos de oração", desc: "Canal pastoral para pedidos, acompanhamento e resposta com cuidado e discrição.", tone: "purple" },
  { icon: "calendar", label: "Agenda e eventos", desc: "Calendário unificado, convites, confirmações e lembretes automáticos.", tone: "green" },
] as const;

const ROLES = [
  { icon: "leadership", role: "Pastor e liderança", tone: "blue", items: ["Painel executivo da comunidade", "Acompanhamento de células", "Relatórios de crescimento", "Gestão de pessoas e papéis"] },
  { icon: "cells", role: "Líder de célula", tone: "green", items: ["Relatório semanal em 2 min", "Lista de membros e visitantes", "Aprovações de entrada", "Agenda do grupo"] },
  { icon: "member", role: "Membro", tone: "purple", items: ["Mural e fio do dia", "Ministérios e escalas", "Pedidos de oração", "Reserva de eventos"] },
] as const;

export { DEFAULT_LANDING_PLANS };

const FAQS = [
  ["Preciso instalar algum aplicativo?", "Não. O Vínkulo funciona diretamente no navegador do celular ou computador, sem instalação. A experiência é otimizada para toque e para telas pequenas."],
  ["Os dados da minha igreja ficam separados de outras?", "Sim. Cada comunidade é um ambiente isolado. Nenhuma outra igreja acessa seus dados operacionais — membros, células, relatórios ou comunicações."],
  ["Posso usar a cor da minha igreja no sistema?", "A personalização depende dos recursos liberados para a sua comunidade. Consulte as condições da proposta."],
  ["Como é o suporte?", "O responsável pela plataforma informa o canal de atendimento ao analisar sua solicitação."],
  ["Posso cancelar quando quiser?", "As condições de duração e encerramento constam na proposta apresentada antes da contratação."],
] as const;

export default function LandingPageExperience({ signedIn, panelHref, canEdit, plans, siteName = "Vínkulo", logoUrl = "" }: LandingPageExperienceProps) {
  const [activeFaq, setActiveFaq] = useState<number | null>(null);
  const signupHref = signedIn ? panelHref : "/log1";
  const loginHref = signedIn ? panelHref : "/login";

  return (
    <main className="vinkulo-site vinkulo-reception vinkulo-landing" data-visual-editor-root data-editor-key="landing-page" aria-label="VÍNKULO — gestão para igrejas e comunidades">
      <nav className="lp-nav" aria-label="Navegação principal">
        <div className="lp-shell lp-nav-inner">
          <Link className="lp-brand" href="/" aria-label={`${siteName} — início`}><VinkuloMark logoUrl={logoUrl} size={40} /><span>{siteName}</span></Link>
          <div className="lp-nav-links">
            <a href="#recursos">Recursos</a><a href="#fio-do-dia">Fio do dia</a>{canEdit ? <a href="#planos">Planos</a> : <Link href="/planos">Planos</Link>}<a href="#duvidas">Dúvidas</a>
          </div>
          <div className="lp-nav-actions">
            <ThemeControl compact cycle />
            {canEdit && <span id="global-editor-toolbar-slot" className="global-editor-toolbar-slot" aria-label="Aparência" />}
            <Link className="lp-button lp-button-small" href={signedIn ? "/painel" : "/login"} showLoading>{signedIn ? "Abrir painel" : "Entrar"} <span aria-hidden="true">→</span></Link>
          </div>
        </div>
      </nav>

      <section className="lp-hero">
        <div className="lp-thread lp-thread-hero" aria-hidden="true"><i /><b /><span /></div>
        <div className="lp-shell lp-hero-content">
          <div className="lp-pill"><span />Gestão para igrejas</div>
          <h1>Tudo que sua <em>comunidade</em> precisa, conectado.</h1>
          <p>Células, ministérios, escalas, visitantes, pedidos de oração e muito mais — em uma plataforma feita para igrejas brasileiras.</p>
          <div className="lp-hero-actions">
            <Link className="lp-button" href={signupHref} showLoading>{signedIn ? "Abrir meu painel" : "Solicitar comunidade"}</Link>
            <a className="lp-button lp-button-secondary" href="#fio-do-dia">Ver demonstração</a>
          </div>

        </div>
      </section>

<section className="lp-section lp-shell" id="recursos">
        <Reveal className="lp-section-heading"><SectionLabel>O que o vínkulo faz</SectionLabel><h2>Cada área da sua igreja, <em>organizada</em></h2><p>Módulos conectados entre si para que pastores, líderes e membros tenham sempre a informação certa.</p></Reveal>
        <div className="lp-module-grid">{MODULES.map((module, index) => <Reveal key={module.label} delay={index * 100}><article className={`lp-module lp-tone-${module.tone}`}><span><FeatureIcon name={module.icon} /></span><h3>{module.label}</h3><p>{module.desc}</p></article></Reveal>)}</div>
      </section>

      <section className="lp-section lp-thread-section" id="fio-do-dia">
        <div className="lp-shell lp-thread-layout">
          <Reveal direction="right"><SectionLabel>O fio do dia</SectionLabel><h2>A linha do tempo da <em>sua comunidade</em></h2><p>Passado sólido, futuro tracejado, o momento presente marcado entre os dois. O fio não é enfeite — ele mostra a direção do tempo da sua igreja.</p><ul className="lp-thread-benefits"><li><i className="blue" />Uma fonte única de verdade</li><li><i className="green" />Atualizações em tempo real</li><li><i className="yellow" />Visão clara do que importa</li></ul></Reveal>
          <Reveal direction="left" delay={200}><TimelineDemo /></Reveal>
        </div>
      </section>

      <section className="lp-section lp-shell">
        <Reveal className="lp-section-heading lp-centered"><SectionLabel>Para quem é</SectionLabel><h2>A visão certa para <em>cada papel</em></h2></Reveal>
        <div className="lp-role-grid">{ROLES.map((role, index) => <Reveal key={role.role} delay={index * 150}><article className={`lp-role lp-tone-${role.tone}`}><header><span><FeatureIcon name={role.icon} /></span><h3>{role.role}</h3></header><ul>{role.items.map((item) => <li key={item}>{item}</li>)}</ul></article></Reveal>)}</div>
      </section>

{canEdit && <section className="lp-section lp-shell" id="planos" data-editor-key="landing-governanca">
        <Reveal className="lp-section-heading lp-centered"><SectionLabel>Planos</SectionLabel><h2>Simples e <em>transparente</em></h2><p>Planos configurados para as necessidades da sua comunidade.</p></Reveal>
        <div className="lp-plan-grid">{plans.map((plan, index) => <Reveal key={plan.name} delay={index * 150}><article className={plan.featured ? "featured" : ""}>{plan.featured && <span className="lp-popular">Destaque</span>}<h3>{plan.name}</h3><div className="lp-price"><strong>{plan.price}</strong>{plan.period && <span>{plan.period}</span>}</div><p>{plan.description}</p><ul>{plan.items.map((item) => <li key={item}><CheckIcon />{item}</li>)}</ul><Link className={`lp-button ${plan.featured ? "" : "lp-button-secondary"}`} href="/log1" showLoading>{plan.cta}</Link></article></Reveal>)}</div>
        <p className="lp-owner-plan-note">Esta prévia é exclusiva do proprietário. <Link href="/proprietario?tab=plans">Configurar planos e chamadas →</Link></p>
      </section>}

      <section className="lp-section lp-faq lp-shell" id="duvidas">
        <Reveal className="lp-section-heading lp-centered"><SectionLabel>Dúvidas</SectionLabel><h2>Perguntas frequentes</h2></Reveal>
        <div>{FAQS.map(([question, answer], index) => <Reveal key={question} delay={index * 100}><article><button type="button" aria-expanded={activeFaq === index} aria-controls={`faq-${index}`} onClick={() => setActiveFaq(activeFaq === index ? null : index)}><span>{question}</span><i aria-hidden="true">+</i></button><div id={`faq-${index}`} hidden={activeFaq !== index}><p>{answer}</p></div></article></Reveal>)}</div>
      </section>

      <section className="lp-final"><Reveal className="lp-shell"><VinkuloMark light size={62} /><h2>Sua comunidade merece o melhor</h2><p>Encontre o plano adequado e solicite sua comunidade.</p><Link className="lp-button lp-button-white" href={signupHref} showLoading>{signedIn ? "Abrir meu painel →" : "Solicitar minha comunidade →"}</Link></Reveal></section>

      <footer className="lp-footer"><div className="lp-shell"><div className="lp-footer-main"><div><Link className="lp-brand" href="/" aria-label={`${siteName} — início`}><VinkuloMark logoUrl={logoUrl} size={40} /><span>{siteName}</span></Link><p>Plataforma de gestão para igrejas e comunidades em português do Brasil.</p></div><nav aria-label="Links institucionais"><Link href="/planos">Planos</Link><Link href="/termos">Termos de uso</Link><Link href="/privacidade">Privacidade</Link><Link href="/contato">Suporte</Link><Link href="/comunidades">Comunidades</Link></nav></div><div className="lp-footer-bottom"><span>© 2026 Vínkulo</span><span>Feito com cuidado para igrejas brasileiras</span></div></div></footer>
    </main>
  );
}

function Reveal({ children, className = "", delay = 0, direction = "up" }: { children: ReactNode; className?: string; delay?: number; direction?: "up" | "left" | "right" }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (typeof IntersectionObserver === "undefined" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const frame = window.requestAnimationFrame(() => setVisible(true));
      return () => window.cancelAnimationFrame(frame);
    }
    const observer = new IntersectionObserver(([entry]) => { if (entry.isIntersecting) { setVisible(true); observer.unobserve(entry.target); } }, { threshold: 0.1 });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return <div ref={ref} className={`lp-reveal lp-from-${direction}${visible ? " is-visible" : ""} ${className}`} style={{ transitionDelay: `${delay}ms` }}>{children}</div>;
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
    calendar: <><rect x="4" y="6" width="16" height="14" rx="2" /><path d="M8 3v5M16 3v5M4 11h16M8 15h.01M12 15h.01M16 15h.01" /></>,
    leadership: <><path d="m12 3 2.4 4.8 5.3.8-3.8 3.7.9 5.3-4.8-2.5-4.8 2.5.9-5.3-3.8-3.7 5.3-.8L12 3Z" /></>,
    member: <><circle cx="12" cy="8" r="4" /><path d="M4 21c.7-4.5 3.3-7 8-7s7.3 2.5 8 7" /></>,
  };
  return <svg viewBox="0 0 24 24" aria-hidden="true" {...common}>{paths[name]}</svg>;
}

function CheckIcon() { return <svg viewBox="0 0 18 18" aria-hidden="true"><circle cx="9" cy="9" r="8" /><path d="m5.5 9 2.4 2.5 4.7-5" /></svg>; }

function TimelineDemo() {
  const events = [
    ["08:30", "Culto de oração", "Realizado", "past"],
    ["Agora", "Reunião de liderança", "Em andamento", "now"],
    ["19h30", "Culto de quarta", "Confirmado", "future"],
    ["Sáb · 10h", "Treinamento de líderes", "6 confirmados", "future"],
  ];
  return <div className="lp-timeline"><div className="lp-timeline-thread" aria-hidden="true"><i /><b /><span /></div><div className="lp-timeline-events">{events.map(([time, title, status, state]) => <article key={title} className={state}><time>{time}</time><div><strong>{title}</strong><span>{status}</span></div></article>)}</div></div>;
}
