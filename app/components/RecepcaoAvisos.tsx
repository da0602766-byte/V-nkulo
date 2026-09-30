"use client";
import StorageOnboarding from "./StorageOnboarding";

import { useCallback, useMemo, useState } from "react";
import type { IntroductionState, PromotionNotice } from "../lib/recepcao";

type IntroStep = {
  eyebrow: string;
  titulo: string;
  descricao: string;
  itens: Array<{ icone: string; titulo: string; texto: string }>;
};

function platformSteps(userName: string): IntroStep[] {
  const firstName = userName.split(" ")[0] || "tudo bem";
  return [
    {
      eyebrow: "Bem-vindo(a) ao VÍNKULO",
      titulo: `Oi, ${firstName}! Que bom ter você aqui.`,
      descricao:
        "O VÍNKULO reúne as rotinas da sua comunidade em um lugar só. Em três telas rápidas você entende como tudo funciona.",
      itens: [
        {
          icone: "🏠",
          titulo: "Uma casa por comunidade",
          texto: "Cada comunidade tem seu espaço, com dados separados das outras.",
        },
        {
          icone: "🔐",
          titulo: "Você vê o que é seu",
          texto: "O que aparece para você depende do seu vínculo e das suas permissões.",
        },
      ],
    },
    {
      eyebrow: "Passo 2 · O que você encontra",
      titulo: "Tudo o que a comunidade faz, reunido",
      descricao: "Estes são os espaços que você vai usar no dia a dia.",
      itens: [
        { icone: "📰", titulo: "Feed", texto: "Avisos e novidades da liderança em ordem." },
        { icone: "📅", titulo: "Agenda", texto: "Eventos, escalas e confirmações de presença." },
        { icone: "🤝", titulo: "Ministérios", texto: "Equipes que você pode conhecer e participar." },
        { icone: "💬", titulo: "Mensagens", texto: "Canal direto com a liderança e com a equipe." },
      ],
    },
    {
      eyebrow: "Passo 3 · Pronto para começar",
      titulo: "Seu perfil, do seu jeito",
      descricao:
        "Complete seu perfil para que a liderança consiga te encontrar e te escalar com contexto.",
      itens: [
        {
          icone: "🙋",
          titulo: "Complete seu perfil",
          texto: "Foto, telefone e disponibilidade ajudam na hora de montar escalas.",
        },
        {
          icone: "❓",
          titulo: "Precisa de ajuda?",
          texto: "Você pode reabrir esta introdução quando quiser, pelo menu da sua conta.",
        },
      ],
    },
  ];
}

function communitySteps(communityName: string): IntroStep[] {
  return [
    {
      eyebrow: "Bem-vindo(a) à comunidade",
      titulo: `Você agora faz parte da ${communityName}`,
      descricao:
        "Antes de explorar, um resumo rápido de como as coisas funcionam por aqui.",
      itens: [
        {
          icone: "📰",
          titulo: "Feed da comunidade",
          texto: "Avisos e novidades da liderança, em ordem cronológica.",
        },
        {
          icone: "📅",
          titulo: "Eventos e escalas",
          texto: "Confirme presença e veja onde você está escalado.",
        },
        {
          icone: "🤝",
          titulo: "Ministérios",
          texto: "Encontre uma equipe e peça para participar.",
        },
        {
          icone: "💬",
          titulo: "Fale com a liderança",
          texto: "Canal direto para dúvidas e pedidos de oração.",
        },
      ],
    },
    {
      eyebrow: "Passo 2 · Como participar",
      titulo: "Seu lugar aqui começa pelas pessoas",
      descricao:
        "Participar de um ministério é a forma mais rápida de se conectar com a comunidade.",
      itens: [
        {
          icone: "✋",
          titulo: "Peça para entrar em um ministério",
          texto: "A liderança recebe seu pedido e responde por aqui mesmo.",
        },
        {
          icone: "✅",
          titulo: "Confirme suas escalas",
          texto: "Quando for escalado, confirme ou avise que não pode com um toque.",
        },
      ],
    },
    {
      eyebrow: "Passo 3 · Tudo pronto",
      titulo: "É só começar",
      descricao:
        "Você pode rever esta introdução quando quiser, pelo menu da sua conta.",
      itens: [
        {
          icone: "🔔",
          titulo: "Fique por dentro",
          texto: "Ative as notificações para não perder avisos importantes.",
        },
        {
          icone: "🌱",
          titulo: "Cresça junto",
          texto: "Se um dia você assumir uma liderança, avisamos por aqui com destaque.",
        },
      ],
    },
  ];
}

export default function RecepcaoAvisos({
  promocao,
  introducao,
  communityName,
  userName,
}: {
  promocao: PromotionNotice | null;
  introducao: IntroductionState;
  communityName: string;
  userName: string;
}) {
  const [notice, setNotice] = useState(promocao);
  const [introState, setIntroState] = useState(introducao);
  const [step, setStep] = useState(0);
  const [closing, setClosing] = useState(false);
  const [storageReady, setStorageReady] = useState(false);
  const finishStorage = useCallback(() => setStorageReady(true), []);

  const introKind = useMemo<"PLATAFORMA" | "COMUNIDADE" | null>(() => {
    if (notice) return null;
    if (!introState.plataforma) return "PLATAFORMA";
    if (!introState.comunidade) return "COMUNIDADE";
    return null;
  }, [notice, introState]);

  const steps = useMemo(() => {
    if (introKind === "PLATAFORMA") return platformSteps(userName);
    if (introKind === "COMUNIDADE") return communitySteps(communityName);
    return [];
  }, [introKind, userName, communityName]);

  const send = useCallback(async (body: Record<string, unknown>) => {
    try {
      await fetch("/api/pilot/recepcao", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    } catch {
      // Um aviso que não conseguiu ser marcado volta no próximo acesso.
      // Preferimos isso a bloquear a entrada da pessoa no painel.
    }
  }, []);

  const dismissPromotion = useCallback(() => {
    if (!notice) return;
    setClosing(true);
    void send({ acao: "MARCAR_PROMOCAO_VISTA", id: notice.id });
    window.setTimeout(() => {
      setNotice(null);
      setClosing(false);
    }, 220);
  }, [notice, send]);

  const finishIntro = useCallback(
    (skipped: boolean) => {
      if (!introKind) return;
      void send({
        acao: "MARCAR_INTRODUCAO",
        tipo: introKind,
        pulada: skipped,
        etapa: step + 1,
      });
      setIntroState((current) =>
        introKind === "PLATAFORMA"
          ? { ...current, plataforma: true }
          : { ...current, comunidade: true },
      );
      setStep(0);
    },
    [introKind, send, step],
  );

  // Serialize first-visit dialogs; never place two onboarding overlays on top of each other.
  if (!storageReady) return <StorageOnboarding onComplete={finishStorage} />;

  if (notice) {
    return (
      <div className={`recepcao-overlay${closing ? " is-closing" : ""}`} role="dialog" aria-modal="true" aria-labelledby="promocao-titulo">
        <div className="promo-dialog">
          <div className="promo-confetti" aria-hidden="true">
            {[0, 1, 2, 3, 4, 5, 6].map((index) => (
              <i key={index} data-i={index} />
            ))}
          </div>
          <span className="promo-eyebrow">Nova posição na comunidade</span>
          <div className="promo-medal" aria-hidden="true">🎉</div>
          <h2 id="promocao-titulo">
            Parabéns, {userName.split(" ")[0] || "tudo bem"}!<br />
            Você agora é <b>{notice.titulo}</b>.
          </h2>
          <p>
            {notice.promovidoPorNome
              ? `${notice.promovidoPorNome} confirmou sua nova função`
              : "A liderança confirmou sua nova função"}
            {notice.escopo === "MINISTERIO" && notice.contexto
              ? ` no ministério ${notice.contexto}.`
              : ` na ${communityName}.`}
          </p>
          {notice.destaques.length > 0 && (
            <ul className="promo-perks">
              {notice.destaques.map((item) => (
                <li key={item}><i aria-hidden="true">✓</i><span>{item}</span></li>
              ))}
            </ul>
          )}
          <div className="promo-actions">
            <button type="button" className="recepcao-primary" onClick={dismissPromotion}>
              Explorar minha nova área
            </button>
            <button type="button" className="recepcao-ghost" onClick={dismissPromotion}>
              Depois
            </button>
          </div>
          <p className="promo-note">
            Este aviso aparece uma única vez — você não vai vê-lo de novo para esta promoção.
          </p>
        </div>
      </div>
    );
  }

  if (!introKind || !steps.length) return null;

  const current = steps[Math.min(step, steps.length - 1)];
  const isLast = step >= steps.length - 1;

  return (
    <div className="recepcao-overlay" role="dialog" aria-modal="true" aria-labelledby="intro-titulo">
      <div className="intro-dialog">
        <header>
          <div className="intro-dots" aria-hidden="true">
            {steps.map((item, index) => (
              <span key={item.eyebrow} className={index === step ? "active" : ""} />
            ))}
          </div>
          <span className="intro-eyebrow">{current.eyebrow}</span>
          <h2 id="intro-titulo">{current.titulo}</h2>
          <p>{current.descricao}</p>
        </header>
        <div className="intro-grid">
          {current.itens.map((item) => (
            <article key={item.titulo}>
              <i aria-hidden="true">{item.icone}</i>
              <b>{item.titulo}</b>
              <span>{item.texto}</span>
            </article>
          ))}
        </div>
        <footer>
          <button type="button" className="intro-skip" onClick={() => finishIntro(true)}>
            Pular introdução
          </button>
          <div className="intro-nav">
            {step > 0 && (
              <button type="button" className="recepcao-ghost" onClick={() => setStep((value) => value - 1)}>
                Voltar
              </button>
            )}
            <button
              type="button"
              className="recepcao-primary"
              onClick={() => (isLast ? finishIntro(false) : setStep((value) => value + 1))}
            >
              {isLast ? "Começar a usar" : "Próximo"}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
