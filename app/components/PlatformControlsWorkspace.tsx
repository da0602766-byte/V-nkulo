"use client";

import { useState } from "react";
import type { PilotFeatureState } from "../lib/pilot-data";
import CommunityLifecycleWorkspace from "./CommunityLifecycleWorkspace";
import LoginCustomizationWorkspace from "./LoginCustomizationWorkspace";
import NetworkFeatureControl from "./NetworkFeatureControl";
import PlatformBrandingWorkspace from "./PlatformBrandingWorkspace";
import CommunityCreationConfigWorkspace from "./CommunityCreationConfigWorkspace";

type ControlTab = "overview" | "login" | "content" | "modules" | "security";

const TABS: { id: ControlTab; label: string; symbol: string }[] = [
  { id: "overview", label: "Visão geral", symbol: "⌁" },
  { id: "login", label: "Portal de acesso", symbol: "◇" },
  { id: "content", label: "Conteúdo", symbol: "✎" },
  { id: "modules", label: "Módulos", symbol: "▦" },
  { id: "security", label: "Segurança", symbol: "◈" },
];

export default function PlatformControlsWorkspace({
  features,
  currentCommunityId,
}: {
  features: PilotFeatureState;
  currentCommunityId: number;
}) {
  const [tab, setTab] = useState<ControlTab>("overview");

  return (
    <section className="platform-controls">
      <header className="workspace-heading platform-controls-heading">
        <div>
          <p className="pilot-kicker">CENTRAL DO PROPRIETÁRIO</p>
          <h1>Controles da plataforma</h1>
          <p>
            Identidade, conteúdo, módulos e segurança organizados por assunto.
            Alterações persistentes continuam auditadas no servidor.
          </p>
        </div>
        <span className="owner-control-badge">Acesso do proprietário</span>
      </header>

      <nav className="platform-control-tabs" aria-label="Áreas de controle">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={tab === item.id ? "active" : ""}
            onClick={() => setTab(item.id)}
          >
            <span aria-hidden="true">{item.symbol}</span>
            {item.label}
          </button>
        ))}
      </nav>

      {tab === "overview" && (
        <div className="platform-control-overview">
          <section className="control-summary-grid">
            <ControlSummary
              symbol="◇"
              label="Portal de acesso"
              value="Personalizável"
              detail="Logo, textos, cores, layout, links e ficha de cadastro"
              onOpen={() => setTab("login")}
            />
            <ControlSummary
              symbol="✎"
              label="Identidade global"
              value="Centralizada"
              detail="Marca, portal de acesso e comunicação institucional"
              onOpen={() => setTab("content")}
            />
            <ControlSummary
              symbol="▦"
              label="Redes e afiliadas"
              value={features.networkModuleEnabled ? "Ativado" : "Desativado"}
              detail="Feature flag global e preparação comercial sem cobrança"
              onOpen={() => setTab("modules")}
            />
            <ControlSummary
              symbol="◈"
              label="Ações críticas"
              value="Protegidas"
              detail="Auditoria ativa; exclusões e pagamentos bloqueados"
              onOpen={() => setTab("security")}
            />
          </section>

          <section className="control-health-card">
            <header>
              <div>
                <p className="pilot-kicker">ESTADO DA PLATAFORMA</p>
                <h2>Proteções principais</h2>
              </div>
              <span>V4.5</span>
            </header>
            <ul>
              <li><span>✓</span> Isolamento por comunidade validado no backend</li>
              <li><span>✓</span> Proprietário com acesso global a todas as comunidades</li>
              <li><span>✓</span> Segredos, hashes, tokens e sessões fora do navegador</li>
              <li><span>✓</span> Pagamentos e publicação automática real desativados</li>
            </ul>
          </section>
        </div>
      )}

      {tab === "login" && (
        <div className="platform-control-stack">
          <LoginCustomizationWorkspace />
          <CommunityCreationConfigWorkspace />
        </div>
      )}
      {tab === "content" && (
        <div className="platform-control-stack">
          <PlatformBrandingWorkspace />
          <section className="sensitive-action-note">
            <strong>Feed público agregado removido</strong>
            <p>
              A plataforma mantém somente a Landing Page, o diretório e as
              páginas institucionais. Publicações permanecem dentro de cada
              comunidade.
            </p>
          </section>
        </div>
      )}
      {tab === "modules" && (
        <div className="platform-control-stack">
          <NetworkFeatureControl />
          <section className="feature-flag-grid">
            <Feature
              name="ai_editorial_enabled"
              enabled={features.aiEditorialEnabled}
              detail={`Automação em ${features.aiEditorialMode}`}
            />
            <Feature
              name="ai_auto_publish_enabled"
              enabled={features.aiAutoPublishEnabled}
              detail="Publicação automática real"
            />
            <Feature
              name="payments_enabled"
              enabled={features.paymentsEnabled}
              detail="Processamento de pagamentos"
            />
          </section>
        </div>
      )}
      {tab === "security" && (
        <div className="platform-control-stack">
          {currentCommunityId > 0 ? (
            <CommunityLifecycleWorkspace
              mode="support"
              currentCommunityId={currentCommunityId}
            />
          ) : (
            <div className="sensitive-action-note">
              <strong>Nenhuma comunidade ativa</strong>
              <p>Crie a primeira comunidade a partir de uma solicitação aprovada.</p>
            </div>
          )}
          <div className="sensitive-action-note">
            <strong>Proteção das ações críticas</strong>
            <p>
              Redes exigem reautenticação por senha, confirmação explícita e
              auditoria. Exclusões, pagamentos e demais ações críticas
              continuam bloqueados até a homologação de MFA.
            </p>
          </div>
        </div>
      )}
    </section>
  );
}

function ControlSummary({
  symbol,
  label,
  value,
  detail,
  onOpen,
}: {
  symbol: string;
  label: string;
  value: string;
  detail: string;
  onOpen: () => void;
}) {
  return (
    <button type="button" className="control-summary-card" onClick={onOpen}>
      <span aria-hidden="true">{symbol}</span>
      <small>{label}</small>
      <strong>{value}</strong>
      <p>{detail}</p>
      <em>Abrir controle →</em>
    </button>
  );
}

function Feature({
  name,
  enabled,
  detail,
}: {
  name: string;
  enabled: boolean;
  detail: string;
}) {
  return (
    <article className="feature-flag-card">
      <span className={enabled ? "on" : "off"}>
        {enabled ? "ATIVO" : "DESATIVADO"}
      </span>
      <strong>{name}</strong>
      <p>{detail}</p>
    </article>
  );
}
