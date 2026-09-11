import { useState } from "react";
import ScrollReveal from "../components/ScrollReveal";

interface Props {
  onGoToReception: () => void;
}

const MODULES = [
  {
    icon: <IconFio />,
    label: "Fio do dia",
    desc: "A linha do tempo da comunidade. Passado sólido, futuro tracejado, o momento certo entre os dois.",
    colorClass: "text-primary",
    bgClass: "bg-primary/15",
  },
  {
    icon: <IconCelula />,
    label: "Células",
    desc: "Gerencie grupos, acompanhe saúde, relatórios semanais e solicitações de entrada.",
    colorClass: "text-[#1B8F63]",
    bgClass: "bg-[#1B8F63]/15",
  },
  {
    icon: <IconMinisterio />,
    label: "Ministérios e escalas",
    desc: "Monte escalas, notifique voluntários e registre quem participa de cada ministério.",
    colorClass: "text-[#A96C10]",
    bgClass: "bg-[#A96C10]/15",
  },
  {
    icon: <IconVisitante />,
    label: "Visitantes",
    desc: "Acolha quem chegou pela primeira vez e acompanhe a jornada de integração.",
    colorClass: "text-[#B93E58]",
    bgClass: "bg-[#B93E58]/15",
  },
  {
    icon: <IconOracao />,
    label: "Pedidos de oração",
    desc: "Canal pastoral para pedidos, acompanhamento e resposta com cuidado e discrição.",
    colorClass: "text-[#6B5ED4]",
    bgClass: "bg-[#6B5ED4]/15",
  },
  {
    icon: <IconAgenda />,
    label: "Agenda e eventos",
    desc: "Calendário unificado, convites, confirmações e lembretes automáticos.",
    colorClass: "text-[#1B8F63]",
    bgClass: "bg-[#1B8F63]/15",
  },
];

const DEPOIMENTOS = [
  {
    nome: "Pr. Rogério Almeida",
    cargo: "Pastor titular",
    igreja: "Igreja Videira Central, SP",
    texto:
      "O Vínkulo transformou como nossa equipe se comunica. A visão do fio do dia mostrou o que acontece na comunidade de um jeito que nenhum outro sistema conseguiu.",
    avatar: "RA",
  },
  {
    nome: "Cristina Ferreira",
    cargo: "Líder de célula",
    igreja: "Comunidade Nova Aliança, MG",
    texto:
      "Antes eu usava planilha e WhatsApp. Agora faço o relatório semanal pelo celular em menos de dois minutos. A célula ficou mais viva.",
    avatar: "CF",
  },
  {
    nome: "Diacono Samuel Costa",
    cargo: "Coordenador de ministérios",
    igreja: "Igreja Betânia, RJ",
    texto:
      "As escalas automáticas com notificação salvaram horas de reunião toda semana. A equipe sabe onde estar e a que horas.",
    avatar: "SC",
  },
];

const PLANOS = [
  {
    nome: "Comunidade",
    preco: "Gratuito",
    desc: "Para igrejas em início de organização digital.",
    itens: [
      "Até 100 membros cadastrados",
      "Módulos: Fio, Agenda, Pedidos",
      "1 administrador",
      "Suporte por e-mail",
    ],
    cta: "Começar grátis",
    destaque: false,
  },
  {
    nome: "Crescimento",
    preco: "R$ 89",
    per: "/mês",
    desc: "Para igrejas em expansão que precisam de mais controle.",
    itens: [
      "Membros ilimitados",
      "Todos os módulos",
      "Até 5 administradores",
      "Células e relatórios",
      "Suporte prioritário",
    ],
    cta: "Experimentar 30 dias grátis",
    destaque: true,
  },
  {
    nome: "Rede",
    preco: "Fale conosco",
    desc: "Para redes de igrejas com múltiplas unidades.",
    itens: [
      "Múltiplas comunidades",
      "Painel de rede unificado",
      "Customização de cor e marca",
      "Suporte dedicado",
      "Treinamento de equipe",
    ],
    cta: "Falar com o time",
    destaque: false,
  },
];

export default function LandingPage({ onGoToReception }: Props) {
  const [activeFaq, setActiveFaq] = useState<number | null>(null);

  return (
    <div className="font-sans text-foreground overflow-x-hidden">
      {/* NAV */}
      <nav className="sticky top-0 z-50 bg-background/80 backdrop-blur-md border-b border-border px-4 md:px-8 h-16 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <VinkuloMark size={24} />
          <span className="font-display font-bold text-xl tracking-tight text-foreground">
            vínkulo
          </span>
        </div>

        <button
          onClick={onGoToReception}
          className="h-10 px-5 rounded-xl bg-primary hover:bg-primary-hover text-primary-foreground font-bold text-sm transition-colors duration-200"
        >
          Entrar →
        </button>
      </nav>

      {/* HERO */}
      <section className="relative pt-20 pb-24 px-6 overflow-hidden">
        {/* Gradiente de fundo */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_100%_80%_at_50%_0%,rgba(37,99,235,0.25)_0%,transparent_70%)] pointer-events-none" />

        {/* Fio visual central */}
        <div className="absolute left-1/2 top-0 -translate-x-1/2 w-[1px] h-full bg-gradient-to-b from-accent/60 to-accent/10 pointer-events-none hidden md:block animate-drawLine" />

        <div className="relative max-w-3xl mx-auto text-center z-10 animate-slide-up">
          <div className="inline-flex items-center gap-2 bg-yellow/15 border border-yellow/30 rounded-full px-4 py-1.5 mb-8">
            <span className="w-1.5 h-1.5 rounded-full bg-yellow animate-pulse" />
            <span className="text-xs font-bold tracking-widest uppercase text-yellow">
              Gestão para igrejas
            </span>
          </div>

          <h1 className="font-display font-extrabold text-5xl md:text-7xl leading-tight tracking-tight text-foreground mb-6">
            Tudo que sua <span className="text-accent">comunidade</span> precisa, conectado.
          </h1>

          <p className="text-lg md:text-xl text-foreground-subtle leading-relaxed mb-10 max-w-2xl mx-auto">
            Células, ministérios, escalas, visitantes, pedidos de oração e muito mais — em uma plataforma feita para igrejas brasileiras.
          </p>

          <div className="flex flex-col sm:flex-row justify-center gap-4">
            <button
              onClick={onGoToReception}
              className="h-14 px-8 rounded-xl bg-primary hover:bg-primary-hover text-primary-foreground font-bold text-lg transition-colors duration-200"
            >
              Começar grátis
            </button>
            <button
              type="button"
              onClick={() => document.getElementById("fio-do-dia")?.scrollIntoView({ behavior: "smooth" })}
              className="h-14 px-8 rounded-xl bg-transparent hover:bg-border/50 text-foreground font-semibold text-lg border border-border transition-colors duration-200"
            >
              Ver demonstração
            </button>
          </div>

          {/* Social proof */}
          <div className="mt-14 flex items-center justify-center gap-4 flex-wrap">
            <div className="flex">
              {["RA", "CF", "SC", "MO"].map((i, index) => (
                <div
                  key={i}
                  className="w-10 h-10 rounded-full bg-primary border-2 border-[#FFFFFF] flex items-center justify-center font-bold text-xs text-primary-foreground -ml-3 first:ml-0"
                  style={{ zIndex: 10 - index }}
                >
                  {i}
                </div>
              ))}
            </div>
            <span className="text-sm text-foreground-muted">
              <strong className="text-foreground">+1.200 igrejas</strong> já usam o Vínkulo
            </span>
          </div>
        </div>
      </section>

      {/* NÚMEROS */}
      <section className="bg-surface py-12 px-6">
        <ScrollReveal className="max-w-5xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-px bg-border rounded-2xl overflow-hidden border border-border">
          {[
            { n: "1.200+", l: "Igrejas" },
            { n: "180K+", l: "Membros" },
            { n: "94%", l: "Retenção" },
            { n: "4.9★", l: "Avaliação" },
          ].map((s) => (
            <div key={s.l} className="bg-surface p-6 text-center flex flex-col justify-center">
              <div className="font-display font-extrabold text-3xl md:text-4xl text-foreground tracking-tight mb-1">
                {s.n}
              </div>
              <div className="text-sm text-foreground-subtle font-medium">
                {s.l}
              </div>
            </div>
          ))}
        </ScrollReveal>
      </section>

      {/* MÓDULOS */}
      <section className="py-20 px-6 max-w-7xl mx-auto">
        <ScrollReveal className="text-center md:text-left mb-12">
          <SectionLabel>O que o vínkulo faz</SectionLabel>
          <h2 className="font-display font-extrabold text-3xl md:text-5xl tracking-tight text-foreground mb-4 mt-2">
            Cada área da sua igreja, <span className="text-primary">organizada</span>
          </h2>
          <p className="text-lg text-foreground-subtle max-w-2xl">
            Módulos conectados entre si para que pastores, líderes e membros tenham sempre a informação certa.
          </p>
        </ScrollReveal>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {MODULES.map((m, idx) => (
            <ScrollReveal key={m.label} delay={idx * 100}>
              <div
              className="bg-surface border border-border rounded-2xl p-6 transition-transform hover:-translate-y-1 hover:shadow-xl hover:shadow-[#000000]/50 hover:border-primary/30 duration-300"
            >
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-5 ${m.bgClass} ${m.colorClass}`}>
                {m.icon}
              </div>
              <div className="font-display font-bold text-xl text-foreground mb-2 tracking-tight">
                {m.label}
              </div>
              <div className="text-[15px] text-foreground-subtle leading-relaxed">
                {m.desc}
              </div>
            </div>
            </ScrollReveal>
          ))}
        </div>
      </section>

      {/* O FIO */}
      <section id="fio-do-dia" className="bg-background py-20 px-6 relative overflow-hidden scroll-mt-16">
        <div className="absolute left-1/2 top-0 bottom-0 w-[1px] bg-gradient-to-b from-transparent via-[#2563EB]/40 to-transparent -translate-x-1/2 pointer-events-none hidden md:block" />

        <div className="relative max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
          <ScrollReveal direction="right">
            <SectionLabel>O fio do dia</SectionLabel>
            <h2 className="font-display font-extrabold text-4xl md:text-5xl tracking-tight text-foreground mb-6 mt-2">
              A linha do tempo da <span className="text-accent">sua comunidade</span>
            </h2>
            <p className="text-lg text-foreground-subtle leading-relaxed mb-6">
              Passado sólido, futuro tracejado, o momento presente marcado entre os dois. O fio não é enfeite — codifica a direção do tempo da sua igreja.
            </p>
            <ul className="space-y-4">
              <li className="flex items-center gap-3 text-foreground"><span className="w-2 h-2 bg-primary rounded-full" /> Uma fonte única de verdade</li>
              <li className="flex items-center gap-3 text-foreground"><span className="w-2 h-2 bg-[#1B8F63] rounded-full" /> Atualizações em tempo real</li>
              <li className="flex items-center gap-3 text-foreground"><span className="w-2 h-2 bg-[#A96C10] rounded-full" /> Visão clara do que importa</li>
            </ul>
          </ScrollReveal>

          {/* Fio ilustrado (Mobile UI Demo) */}
          <ScrollReveal direction="left" delay={200}>
          <div className="bg-surface border border-border rounded-[2rem] p-6 flex gap-5 shadow-2xl relative">
            {/* Linha vertical */}
            <div className="flex flex-col items-center pt-2">
              <div className="w-0.5 h-16 bg-accent" />
              <div className="w-3.5 h-3.5 rounded-full bg-primary shadow-[0_0_16px_4px_rgba(37,99,235,0.5)] shrink-0 z-10 animate-pulse-glow" />
              <div className="w-[1px] h-32 border-l-2 border-dashed border-accent/30" />
            </div>

            {/* Eventos */}
            <div className="flex-1 flex flex-col gap-4">
              {[
                {
                  hora: "08:30",
                  titulo: "Culto de oração",
                  status: "Realizado",
                  cor: "text-[#1B8F63]",
                  bg: "bg-[#1B8F63]/10",
                  past: true,
                },
                {
                  hora: "Agora",
                  titulo: "Reunião de liderança",
                  status: "Em andamento",
                  cor: "text-accent",
                  bg: "bg-accent/15",
                  past: false,
                  now: true,
                },
                {
                  hora: "19h30",
                  titulo: "Culto de quarta",
                  status: "Confirmado",
                  cor: "text-foreground-subtle",
                  bg: "bg-border/50",
                  past: false,
                },
                {
                  hora: "Sáb · 10h",
                  titulo: "Treinamento de líderes",
                  status: "6 confirmados",
                  cor: "text-foreground-subtle",
                  bg: "bg-border/50",
                  past: false,
                },
              ].map((ev) => (
                <div
                  key={ev.titulo}
                  className={`rounded-2xl transition-all ${
                    ev.now
                      ? "bg-accent/10 border border-accent/30 p-4 -ml-2"
                      : "p-2 opacity-60 hover:opacity-100"
                  }`}
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <span className={`font-mono text-xs font-semibold block mb-1 ${ev.now ? 'text-accent' : 'text-foreground-muted'}`}>
                        {ev.hora}
                      </span>
                      <span className={`font-sans text-base font-bold ${ev.now ? 'text-foreground' : 'text-foreground-subtle'}`}>
                        {ev.titulo}
                      </span>
                    </div>
                    <span className={`text-[11px] font-bold px-3 py-1 rounded-full ${ev.cor} ${ev.bg}`}>
                      {ev.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
          </ScrollReveal>
        </div>
      </section>

      {/* PAPÉIS */}
      <section className="py-24 px-6 max-w-7xl mx-auto">
        <ScrollReveal className="text-center mb-16">
          <SectionLabel>Para quem é</SectionLabel>
          <h2 className="font-display font-extrabold text-4xl md:text-5xl tracking-tight text-foreground mt-2 mb-4">
            A visão certa para <span className="text-primary">cada papel</span>
          </h2>
        </ScrollReveal>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[
            {
              role: "Pastor e liderança",
              icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>,
              colorClass: "bg-primary",
              iconBg: "bg-primary/15",
              iconText: "text-primary",
              itens: [
                "Painel executivo da comunidade",
                "Acompanhamento de células",
                "Relatórios de crescimento",
                "Gestão de pessoas e papéis",
              ],
            },
            {
              role: "Líder de célula",
              icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>,
              colorClass: "bg-[#1B8F63]",
              iconBg: "bg-[#1B8F63]/15",
              iconText: "text-[#1B8F63]",
              itens: [
                "Relatório semanal em 2 min",
                "Lista de membros e visitantes",
                "Aprovações de entrada",
                "Agenda do grupo",
              ],
            },
            {
              role: "Membro",
              icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>,
              colorClass: "bg-[#6B5ED4]",
              iconBg: "bg-[#6B5ED4]/15",
              iconText: "text-[#6B5ED4]",
              itens: [
                "Mural e fio do dia",
                "Ministérios e escalas",
                "Pedidos de oração",
                "Reserva de eventos",
              ],
            },
          ].map((r, idx) => (
            <ScrollReveal key={r.role} delay={idx * 150}>
            <div className="bg-surface border border-border rounded-3xl p-8 hover:border-primary/50 transition-colors duration-300">
              <div className="flex items-center gap-4 mb-6">
                <div className={`w-14 h-14 rounded-2xl flex items-center justify-center ${r.iconBg} ${r.iconText}`}>
                  {r.icon}
                </div>
                <h3 className="font-display font-bold text-xl text-foreground tracking-tight">
                  {r.role}
                </h3>
              </div>
              <ul className="space-y-4">
                {r.itens.map((item) => (
                  <li key={item} className="flex items-start gap-3">
                    <span className={`w-2 h-2 rounded-full mt-2 shrink-0 ${r.colorClass}`} />
                    <span className="text-foreground-subtle text-[15px] leading-relaxed">
                      {item}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
            </ScrollReveal>
          ))}
        </div>
      </section>

      {/* DEPOIMENTOS */}
      <section className="py-24 px-6 bg-surface">
        <ScrollReveal className="max-w-7xl mx-auto text-center mb-16">
          <SectionLabel>Depoimentos</SectionLabel>
          <h2 className="font-display font-extrabold text-4xl md:text-5xl tracking-tight text-foreground mt-2 mb-4">
            Quem usa, <span className="text-primary-light">recomenda</span>
          </h2>
        </ScrollReveal>

        <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-8">
          {DEPOIMENTOS.map((d, idx) => (
            <ScrollReveal key={d.nome} delay={idx * 150}>
            <div className="bg-background border border-border rounded-3xl p-8 flex flex-col justify-between hover:border-primary/30 transition-colors duration-300">
              <p className="text-foreground-subtle text-lg leading-relaxed italic mb-8">
                "{d.texto}"
              </p>
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-primary flex items-center justify-center font-bold text-primary-foreground shrink-0 text-sm">
                  {d.avatar}
                </div>
                <div>
                  <div className="font-bold text-foreground text-base">{d.nome}</div>
                  <div className="text-foreground-muted text-sm">{d.cargo} · {d.igreja}</div>
                </div>
              </div>
            </div>
            </ScrollReveal>
          ))}
        </div>
      </section>

      {/* PLANOS */}
      <section className="py-24 px-6 max-w-7xl mx-auto">
        <ScrollReveal className="text-center mb-16">
          <SectionLabel>Planos</SectionLabel>
          <h2 className="font-display font-extrabold text-4xl md:text-5xl tracking-tight text-foreground mt-2 mb-4">
            Simples e <span className="text-primary">transparente</span>
          </h2>
          <p className="text-lg text-foreground-subtle">
            Comece grátis. Escale quando sua comunidade crescer.
          </p>
        </ScrollReveal>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 items-start">
          {PLANOS.map((p, idx) => (
            <ScrollReveal key={p.nome} delay={idx * 150}>
            <div
              className={`relative rounded-[2.5rem] p-8 md:p-10 ${
                p.destaque
                  ? "bg-gradient-to-b from-surface to-background border-2 border-yellow shadow-2xl shadow-yellow/20 md:-mt-4"
                  : "bg-surface border border-border"
              }`}
            >
              {p.destaque && (
                <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-yellow text-[#0F172A] font-bold text-xs tracking-widest uppercase px-5 py-1.5 rounded-full">
                  Mais popular
                </div>
              )}
              <div className={`font-display font-bold text-2xl mb-4 ${p.destaque ? 'text-foreground' : 'text-foreground'}`}>
                {p.nome}
              </div>
              <div className="flex items-baseline gap-2 mb-2">
                <span className={`font-display font-extrabold text-4xl md:text-5xl tracking-tight ${p.destaque ? 'text-foreground' : 'text-foreground'}`}>
                  {p.preco}
                </span>
                {p.per && <span className="text-foreground-subtle text-base">{p.per}</span>}
              </div>
              <p className="text-foreground-subtle text-[15px] mb-8 min-h-[48px]">
                {p.desc}
              </p>

              <ul className="space-y-4 mb-10">
                {p.itens.map((item) => (
                  <li key={item} className="flex items-center gap-3">
                    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" className="shrink-0">
                      <circle cx="9" cy="9" r="9" fill={p.destaque ? "rgba(37,99,235,0.2)" : "rgba(0,0,0,0.02)"} />
                      <path d="M5.5 9l2.5 2.5 4.5-5" stroke={p.destaque ? "#3B82F6" : "#475569"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    <span className="text-foreground text-[15px]">{item}</span>
                  </li>
                ))}
              </ul>

              <button
                onClick={onGoToReception}
                className={`w-full h-14 rounded-xl font-bold text-base transition-all duration-200 ${
                  p.destaque
                    ? "bg-primary hover:bg-primary-hover text-primary-foreground"
                    : "bg-border/50 hover:bg-border text-foreground border border-border"
                }`}
              >
                {p.cta}
              </button>
            </div>
            </ScrollReveal>
          ))}
        </div>
      </section>

      {/* FAQ */}
      <section className="py-24 px-6 max-w-3xl mx-auto">
        <ScrollReveal className="text-center mb-12">
          <SectionLabel>Dúvidas</SectionLabel>
          <h2 className="font-display font-extrabold text-3xl md:text-4xl tracking-tight text-foreground mt-2 mb-4">
            Perguntas frequentes
          </h2>
        </ScrollReveal>

        <div className="flex flex-col gap-4">
          {[
            {
              q: "Preciso instalar algum aplicativo?",
              a: "Não. O Vínkulo funciona diretamente no navegador do celular ou computador, sem instalação. A experiência é otimizada para toque e para telas pequenas.",
            },
            {
              q: "Os dados da minha igreja ficam separados de outras?",
              a: "Sim. Cada comunidade é um ambiente isolado. Nenhuma outra igreja acessa seus dados operacionais — membros, células, relatórios ou comunicações.",
            },
            {
              q: "Posso usar a cor da minha igreja no sistema?",
              a: "Sim. No plano Crescimento e Rede, você pode personalizar a cor de acento do sistema com a identidade visual da sua comunidade.",
            },
            {
              q: "Como é o suporte?",
              a: "Por e-mail para o plano gratuito. Suporte prioritário (resposta em até 4h) para o plano Crescimento, e suporte dedicado com gerente de conta para o plano Rede.",
            },
            {
              q: "Posso cancelar quando quiser?",
              a: "Sim. Não há fidelidade. Você cancela pelo painel e continua com acesso até o fim do período pago.",
            },
          ].map((faq, i) => (
            <ScrollReveal key={i} delay={i * 100}>
            <div className="bg-surface border border-border rounded-2xl overflow-hidden transition-colors hover:border-primary/50">
              <button
                onClick={() => setActiveFaq(activeFaq === i ? null : i)}
                className="w-full text-left p-6 flex justify-between items-center gap-4 focus:outline-none"
              >
                <span className="font-bold text-foreground text-[17px] pr-4">{faq.q}</span>
                <span className={`text-primary text-2xl transition-transform duration-300 flex-shrink-0 ${activeFaq === i ? 'rotate-45' : 'rotate-0'}`}>
                  +
                </span>
              </button>
              <div className={`overflow-hidden transition-all duration-300 ${activeFaq === i ? 'max-h-[500px] opacity-100 pb-6 px-6' : 'max-h-0 opacity-0 px-6'}`}>
                <p className="text-foreground-subtle text-[15px] leading-relaxed">
                  {faq.a}
                </p>
              </div>
            </div>
            </ScrollReveal>
          ))}
        </div>
      </section>

      {/* CTA FINAL */}
      <section className="relative bg-primary py-24 px-6 text-center overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_50%_50%,rgba(0,0,0,0.04)_0%,transparent_70%)] pointer-events-none" />
        
        <ScrollReveal className="relative z-10 max-w-2xl mx-auto flex flex-col items-center">
          <VinkuloMark size={64} light />
          <h2 className="font-display font-extrabold text-4xl md:text-5xl tracking-tight text-primary-foreground mt-8 mb-6 leading-tight">
            Sua comunidade merece o melhor
          </h2>
          <p className="text-lg md:text-xl text-primary-foreground/80 mb-10">
            Comece gratuitamente hoje. Sem cartão de crédito.
          </p>

          <button
            onClick={onGoToReception}
            className="h-16 px-10 rounded-2xl bg-background text-primary font-bold text-lg hover:bg-white hover:scale-105 transition-all duration-200 shadow-xl shadow-slate-300/30"
          >
            Criar conta grátis →
          </button>
        </ScrollReveal>
      </section>

      {/* FOOTER */}
      <footer className="bg-background border-t border-border py-12 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-8 mb-12">
            <div>
              <div className="flex items-center gap-2 mb-4">
                <VinkuloMark size={24} />
                <span className="font-display font-bold text-xl tracking-tight text-foreground">
                  vínkulo
                </span>
              </div>
              <p className="text-foreground-muted text-sm max-w-xs leading-relaxed">
                Plataforma de gestão para igrejas e comunidades em português do Brasil.
              </p>
            </div>
            
            <div className="flex flex-wrap gap-6 text-sm font-medium">
              {["Termos de uso", "Privacidade", "Suporte", "Blog"].map((l) => (
                <a key={l} href="#" className="text-foreground-subtle hover:text-primary-light transition-colors">
                  {l}
                </a>
              ))}
            </div>
          </div>
          
          <div className="pt-8 border-t border-border/50 text-foreground-muted text-[13px] flex flex-col md:flex-row justify-between items-center gap-4">
            <p>© 2026 Vínkulo</p>
            <p>Feito com cuidado para igrejas brasileiras</p>
          </div>
        </div>
      </footer>
    </div>
  );
}

/* ── Helpers ── */

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="font-sans text-sm font-bold tracking-widest uppercase text-primary mb-2">
      {children}
    </p>
  );
}

function VinkuloMark({ light, size = 28 }: { light?: boolean; size?: number }) {
  const bg = light ? "#FFFFFF" : "var(--primary)";
  const fg = light ? "var(--primary)" : "#FFFFFF";
  const accent = "var(--accent)";
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" fill="none" aria-hidden>
      <rect width="28" height="28" rx="8" fill={bg} />
      <line x1="14" y1="5" x2="14" y2="12" stroke={accent} strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="14" cy="14" r="2.5" fill={accent} />
      <line x1="14" y1="16" x2="14" y2="23" stroke={accent} strokeWidth="1.6" strokeLinecap="round" strokeDasharray="2 2" />
      <line x1="7" y1="14" x2="11" y2="14" stroke={fg} strokeWidth="1.6" strokeLinecap="round" />
      <line x1="17" y1="14" x2="21" y2="14" stroke={fg} strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="6" cy="14" r="1.5" fill={fg} opacity="0.6" />
      <circle cx="22" cy="14" r="1.5" fill={fg} opacity="0.6" />
    </svg>
  );
}

/* ── Module icons ── */

function IconFio() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <line x1="10" y1="2" x2="10" y2="8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="10" cy="10" r="2" fill="currentColor" />
      <line x1="10" y1="12" x2="10" y2="18" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeDasharray="2 1.5" />
    </svg>
  );
}

function IconCelula() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <circle cx="10" cy="10" r="2" fill="currentColor" />
      <circle cx="4" cy="7" r="1.5" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="16" cy="7" r="1.5" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="4" cy="13" r="1.5" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="16" cy="13" r="1.5" stroke="currentColor" strokeWidth="1.4" />
      <line x1="8.3" y1="9.1" x2="5.4" y2="7.7" stroke="currentColor" strokeWidth="1.3" />
      <line x1="11.7" y1="9.1" x2="14.6" y2="7.7" stroke="currentColor" strokeWidth="1.3" />
      <line x1="8.3" y1="10.9" x2="5.4" y2="12.3" stroke="currentColor" strokeWidth="1.3" />
      <line x1="11.7" y1="10.9" x2="14.6" y2="12.3" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  );
}

function IconMinisterio() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <rect x="3" y="9" width="14" height="8" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <path d="M7 9V6a3 3 0 016 0v3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="10" y1="12" x2="10" y2="14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function IconVisitante() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <circle cx="10" cy="7" r="3" stroke="currentColor" strokeWidth="1.5" />
      <path d="M4 17c0-3.314 2.686-5 6-5s6 1.686 6 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M15 4l2 2-2 2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconOracao() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <path d="M10 3C10 3 5 6.5 5 10.5a5 5 0 0010 0C15 6.5 10 3 10 3z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <line x1="10" y1="8" x2="10" y2="13" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <line x1="7.5" y1="10.5" x2="12.5" y2="10.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function IconAgenda() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <rect x="3" y="5" width="14" height="12" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <line x1="7" y1="3" x2="7" y2="7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="13" y1="3" x2="13" y2="7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="3" y1="9" x2="17" y2="9" stroke="currentColor" strokeWidth="1.3" />
      <circle cx="7" cy="12.5" r="1" fill="currentColor" />
      <circle cx="10" cy="12.5" r="1" fill="currentColor" />
      <circle cx="13" cy="12.5" r="1" fill="currentColor" />
    </svg>
  );
}
