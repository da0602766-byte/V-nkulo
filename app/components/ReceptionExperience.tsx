"use client";
import SafeImage from "./SafeImage";


import { useEffect, useRef, useState } from "react";
import Link from "./StableLink";

type ReceptionCommunity = {
  id: number;
  nome: string;
  slug: string;
  descricao: string;
  cidade: string;
  logoUrl: string;
};

const AUDIENCES = [
  {
    id: "participa",
    label: "Quem participa",
    icon: "participant",
    titulo: "Uma recepção simples, feita pra ficar",
    texto:
      "Feed da comunidade, próximos eventos e onde estar no domingo — sem depender de grupo lotado.",
    itens: [
      "Introdução guiada ao entrar pela primeira vez",
      "Feed e avisos da liderança em um só lugar",
      "Confirmação de presença em eventos com um toque",
    ],
    painel: [
      ["Próximo culto", "Domingo, 18h"],
      ["Sua escala", "Livre esta semana"],
      ["Avisos novos", "3"],
    ],
  },
  {
    id: "lidera",
    label: "Quem lidera",
    icon: "leader",
    titulo: "Ferramentas completas de gestão",
    texto:
      "Organize ministérios, escalas, visitantes e comunicação sem planilhas paralelas.",
    itens: [
      "Escalas, checklists e confirmações automáticas",
      "Aviso especial quando alguém da equipe é promovido",
      "Relatórios ligados a cada ministério",
    ],
    painel: [
      ["Escalas abertas", "6"],
      ["Confirmações pendentes", "4"],
      ["Novas pessoas no mês", "+18"],
    ],
  },
] as const;

const JOURNEY = [
  {
    etapa: "Chegada",
    titulo: "Você chega pela comunidade",
    texto:
      "Por convite de alguém, indicação ou buscando no diretório público de comunidades ativas.",
  },
  {
    etapa: "Introdução",
    titulo: "Recebe a introdução",
    texto:
      "Um mini-tour mostra como o feed, os eventos e os ministérios funcionam antes de você explorar sozinho.",
  },
  {
    etapa: "Participação",
    titulo: "Participa e se conecta",
    texto:
      "Acompanha o feed, confirma presença nos eventos e entra em um ministério que combina com você.",
  },
  {
    etapa: "Liderança",
    titulo: "Pode crescer em liderança",
    texto:
      "Ao ser promovida(o), você recebe um aviso comemorativo explicando exatamente o que mudou.",
  },
] as const;

const TESTIMONIALS = [
  {
    texto:
      "Paramos de perder confirmação de escala no WhatsApp. Todo mundo vê a mesma informação, na hora certa.",
    nome: "Marina Costa",
    papel: "Líder de Louvor",
    iniciais: "MC",
  },
  {
    texto:
      "A introdução ajudou demais os novos membros. Ninguém mais chega perdido no primeiro domingo.",
    nome: "Rafael Souza",
    papel: "Pastor",
    iniciais: "RS",
  },
  {
    texto:
      "Organizar ministério, escala e avisos no mesmo lugar economizou horas da nossa secretaria.",
    nome: "Elen Jamille",
    papel: "Coordenadora de célula",
    iniciais: "EJ",
  },
] as const;

const FEATURES = [
  { icone: "people", titulo: "Pessoas", texto: "Perfis e vínculos" },
  { icone: "controls", titulo: "Ministérios", texto: "Equipes e escalas" },
  { icone: "calendar", titulo: "Eventos", texto: "Agenda e inscrições" },
  { icone: "message", titulo: "Comunicação", texto: "Feed e avisos" },
  { icone: "spark", titulo: "IA com revisão", texto: "Rascunhos aprovados" },
] as const;

type ReceptionIconName = "participant" | "leader" | "people" | "controls" | "calendar" | "message" | "spark" | "celebration";

function ReceptionIcon({ name }: { name: ReceptionIconName }) {
  const paths: Record<ReceptionIconName, React.ReactNode> = {
    participant: <><circle cx="12" cy="8" r="3" /><path d="M5 20c.7-4 3.1-6 7-6s6.3 2 7 6" /></>,
    leader: <><path d="m12 3 2.2 4.5 4.8.7-3.5 3.4.8 4.8-4.3-2.3-4.3 2.3.8-4.8-3.5-3.4 4.8-.7L12 3Z" /></>,
    people: <><circle cx="9" cy="9" r="3" /><circle cx="17" cy="10" r="2.5" /><path d="M3.5 20c.6-4 2.5-6 5.5-6 3.1 0 5 2 5.5 6M15 15c2.8.2 4.5 1.9 5 5" /></>,
    controls: <><path d="M4 7h16M4 17h16" /><circle cx="9" cy="7" r="2" /><circle cx="15" cy="17" r="2" /></>,
    calendar: <><rect x="4" y="5" width="16" height="15" rx="2" /><path d="M8 3v4M16 3v4M4 10h16" /></>,
    message: <><path d="M5 5h14v10H10l-5 4V5Z" /><path d="M8 9h8M8 12h5" /></>,
    spark: <path d="m12 3 1.7 5.3L19 10l-5.3 1.7L12 17l-1.7-5.3L5 10l5.3-1.7L12 3Zm6 13 .7 2.3L21 19l-2.3.7L18 22l-.7-2.3L15 19l2.3-.7L18 16Z" />,
    celebration: <><path d="M5 18 9 6l8 4-4 10-8-2Z" /><path d="m10 7 1 4m2-3 1 4m4-6 2-2m-4 0 1-3" /></>,
  };
  return <svg className="rc-icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}

export default function ReceptionExperience({
  communities,
  signedIn,
  panelHref,
}: {
  communities: ReceptionCommunity[];
  signedIn: boolean;
  panelHref: string;
}) {
  const [audience, setAudience] = useState(0);
  const [journey, setJourney] = useState(0);
  const [testimonial, setTestimonial] = useState(0);
  const stackCard = useRef<HTMLDivElement | null>(null);

  // Revelação ao rolar: cada bloco aparece quando entra na tela.
  useEffect(() => {
    const targets = Array.from(
      document.querySelectorAll<HTMLElement>("[data-rc-reveal]"),
    );
    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    if (reduced || typeof IntersectionObserver === "undefined") return;
    // A classe só entra aqui: assim o conteúdo nunca fica invisível quando o
    // JavaScript não roda ou falha antes de revelar os blocos.
    const root = document.querySelector(".vinkulo-reception");
    root?.classList.add("rc-ready");
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        });
      },
      { threshold: 0.15 },
    );
    targets.forEach((target) => observer.observe(target));
    return () => {
      observer.disconnect();
      root?.classList.remove("rc-ready");
    };
  }, []);

  function tilt(event: React.MouseEvent<HTMLDivElement>) {
    const card = stackCard.current;
    if (!card) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const bounds = card.getBoundingClientRect();
    const x = (event.clientX - bounds.left) / bounds.width - 0.5;
    const y = (event.clientY - bounds.top) / bounds.height - 0.5;
    card.style.setProperty("--rc-rx", `${(y * -9).toFixed(2)}deg`);
    card.style.setProperty("--rc-ry", `${(x * 12).toFixed(2)}deg`);
  }

  function resetTilt() {
    const card = stackCard.current;
    if (!card) return;
    card.style.setProperty("--rc-rx", "0deg");
    card.style.setProperty("--rc-ry", "0deg");
  }

  const activeAudience = AUDIENCES[audience];
  const activeJourney = JOURNEY[journey];
  const activeTestimonial = TESTIMONIALS[testimonial];
  const marqueeNames = communities.length
    ? communities.map((community) => community.nome)
    : [
        "Comunidade Vida Nova",
        "Igreja Renascer em Cristo",
        "Ministério Águas Vivas",
        "Comunidade Reconstruir",
      ];

  return (
    <>
      <section className="rc-hero" data-rc-reveal>
        <div className="rc-hero-copy">
          <span className="rc-kicker">Gestão de comunidades</span>
          <h1>
            Sua comunidade,
            <br />
            <em>conectada de verdade.</em>
          </h1>
          <p className="rc-hero-sub">
            Um só lugar para quem participa acompanhar a comunidade e para quem
            lidera organizar pessoas, ministérios e eventos — sem planilhas
            soltas.
          </p>
          <div className="rc-actions">
            <Link className="rc-primary" href={panelHref}>
              {signedIn ? "Abrir meu painel" : "Entrar no VÍNKULO"} →
            </Link>
            <Link className="rc-secondary" href="/comunidades">
              Encontrar uma comunidade
            </Link>
          </div>
          <div className="rc-stats">
            <div>
              <strong>{communities.length || "+120"}</strong>
              <span>comunidades ativas</span>
            </div>
            <div>
              <strong>1 lugar</strong>
              <span>para toda a rotina</span>
            </div>
            <div>
              <strong>3 min</strong>
              <span>para começar</span>
            </div>
          </div>
        </div>
        <div className="rc-stack" onMouseMove={tilt} onMouseLeave={resetTilt}>
          <span className="rc-badge rc-badge-a"><ReceptionIcon name="celebration" /> Promovida a Líder</span>
          <span className="rc-badge rc-badge-b"><ReceptionIcon name="calendar" /> Culto confirmado</span>
          <div className="rc-card rc-card-back" aria-hidden="true">
            <h3>Escalas da semana</h3>
            <i /><i /><i />
          </div>
          <div className="rc-card rc-card-mid" aria-hidden="true">
            <h3>Feed da comunidade</h3>
            <i /><i /><i />
          </div>
          <div className="rc-card rc-card-front" ref={stackCard} aria-hidden="true">
            <h3>Painel de hoje</h3>
            <i /><i /><i />
            <div className="rc-card-chip">✓ Tudo em dia</div>
          </div>
        </div>
      </section>

      <section className="rc-section" id="recursos" data-rc-reveal>
        <header>
          <p className="rc-eyebrow">Dois caminhos, uma plataforma</p>
          <h2>Para quem participa e para quem lidera.</h2>
          <p>
            Escolha o seu lado e veja o que muda no dia a dia da comunidade.
          </p>
        </header>
        <div className="rc-switch-tabs" role="tablist" aria-label="Público da plataforma">
          {AUDIENCES.map((item, index) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              id={`rc-tab-${item.id}`}
              aria-selected={audience === index}
              aria-controls={`rc-panel-${item.id}`}
              onClick={() => setAudience(index)}
            >
              <ReceptionIcon name={item.icon} /> {item.label}
            </button>
          ))}
        </div>
        <div
          className="rc-switch-panel"
          role="tabpanel"
          id={`rc-panel-${activeAudience.id}`}
          aria-labelledby={`rc-tab-${activeAudience.id}`}
        >
          <div>
            <h3>{activeAudience.titulo}</h3>
            <p>{activeAudience.texto}</p>
            <ul>
              {activeAudience.itens.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
          <div className="rc-switch-visual">
            {activeAudience.painel.map(([rotulo, valor]) => (
              <div key={rotulo}>
                <span>{rotulo}</span>
                <b>{valor}</b>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="rc-section" data-rc-reveal>
        <div className="rc-features">
          {FEATURES.map((feature) => (
            <article key={feature.titulo}>
              <i><ReceptionIcon name={feature.icone} /></i>
              <b>{feature.titulo}</b>
              <small>{feature.texto}</small>
            </article>
          ))}
        </div>
      </section>

      <section className="rc-section" data-rc-reveal>
        <header>
          <p className="rc-eyebrow">Sua jornada aqui</p>
          <h2>Do primeiro convite à liderança.</h2>
          <p>Clique em cada etapa para ver o que acontece.</p>
        </header>
        <div className="rc-journey-track" role="tablist" aria-label="Etapas da jornada">
          {JOURNEY.map((item, index) => (
            <button
              key={item.etapa}
              type="button"
              role="tab"
              data-step={index + 1}
              aria-selected={journey === index}
              aria-controls="rc-journey-detail"
              onClick={() => setJourney(index)}
            >
              {item.etapa}
            </button>
          ))}
        </div>
        <div className="rc-journey-detail" id="rc-journey-detail" role="tabpanel">
          <b>{activeJourney.titulo}</b>
          <span>{activeJourney.texto}</span>
        </div>
      </section>

      <section className="rc-section" id="comunidades" data-rc-reveal>
        <header>
          <p className="rc-eyebrow">Comunidades</p>
          <h2>Conheça páginas institucionais ativas.</h2>
          <p>
            O diretório mostra apenas informações públicas. Conteúdo interno
            exige vínculo aprovado.
          </p>
        </header>
        <div className="rc-communities">
          {communities.slice(0, 3).map((community) => (
            <article key={community.id}>
              <figure>
                {community.logoUrl ? (
                  <SafeImage loading="lazy" src={community.logoUrl} alt="" />
                ) : (
                  community.nome.slice(0, 1)
                )}
              </figure>
              <small>{community.cidade || "Comunidade"}</small>
              <h3>{community.nome}</h3>
              <p>{community.descricao}</p>
              <Link href={`/comunidades/${community.slug}`}>
                Conhecer comunidade →
              </Link>
            </article>
          ))}
          {!communities.length && (
            <div className="rc-empty">
              <strong>Diretório em preparação</strong>
              <p>As comunidades aparecem aqui após ativação pelo proprietário.</p>
            </div>
          )}
        </div>
      </section>

      <section className="rc-section" data-rc-reveal>
        <header>
          <p className="rc-eyebrow">Depoimentos</p>
          <h2>Quem já usa recomenda.</h2>
        </header>
        <div className="rc-testimonial">
          <blockquote>“{activeTestimonial.texto}”</blockquote>
          <footer>
            <i>{activeTestimonial.iniciais}</i>
            <div>
              <b>{activeTestimonial.nome}</b>
              <span>{activeTestimonial.papel}</span>
            </div>
          </footer>
          <div className="rc-testimonial-dots" role="tablist" aria-label="Depoimentos">
            {TESTIMONIALS.map((item, index) => (
              <button
                key={item.nome}
                type="button"
                role="tab"
                aria-selected={testimonial === index}
                aria-label={`Depoimento de ${item.nome}`}
                onClick={() => setTestimonial(index)}
              />
            ))}
          </div>
        </div>
      </section>

      <div className="rc-marquee" data-rc-reveal>
        <p>Comunidades conectadas pelo VÍNKULO</p>
        <div className="rc-marquee-track">
          {[...marqueeNames, ...marqueeNames].map((nome, index) => (
            <span key={`${nome}-${index}`}>
              <i />
              {nome}
            </span>
          ))}
        </div>
      </div>
    </>
  );
}
