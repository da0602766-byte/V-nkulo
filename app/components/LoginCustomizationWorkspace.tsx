"use client";

import { FormEvent, useEffect, useState } from "react";
import type {
  PilotLoginConfig,
  PilotSignupField,
} from "../lib/pilot-login-config";
import NativeImageUpload from "./NativeImageUpload";

type SignupAccount = {
  id: number;
  nome: string;
  email: string;
  telefone: string | null;
  ativo: boolean;
  criadoEm: string;
  dados: { id: string; label: string; value: string }[];
};

const EMPTY: PilotLoginConfig = {
  siteName: "Vínkulo",
  kicker: "PORTAL DA COMUNIDADE",
  titulo: "Bem-vindo ao Vínkulo",
  subtitulo: "Acesso individual e protegido à sua comunidade.",
  logoUrl: "",
  backgroundImageUrl: "",
  backgroundColor: "#050817",
  accentColor: "#23cbd1",
  cardColor: "#ffffff",
  layout: "CENTERED",
  cardStyle: "GLASS",
  backgroundPosition: "CENTER",
  backgroundFit: "SMART",
  overlayStrength: 68,
  themeMode: "AUTO",
  rememberMeEnabled: true,
  loginButtonText: "Entrar",
  signupLinkText: "Criar minha conta",
  recoveryLinkText: "Esqueci minha senha",
  exploreLinkText: "Explorar comunidades",
  socialTitle: "Acompanhe nossas redes",
  facebookUrl: "",
  instagramUrl: "",
  youtubeUrl: "",
  whatsappUrl: "",
  cadastroHabilitado: true,
  recuperacaoHabilitada: true,
  explorarComunidadesHabilitado: true,
  avisoPilotoHabilitado: true,
  signupFields: [],
};

const LOGIN_PALETTES = [
  { id: "CLASSICO", name: "Clássico", background: "#101821", accent: "#d6a44a", card: "#fbfaf7" },
  { id: "MODERNO", name: "Moderno", background: "#090d18", accent: "#8059ee", card: "#f8f8fb" },
  { id: "CORPORATIVO", name: "Corporativo", background: "#0b1a1e", accent: "#3ca18a", card: "#f6faf9" },
] as const;

export default function LoginCustomizationWorkspace() {
  const [config, setConfig] = useState(EMPTY);
  const [accounts, setAccounts] = useState<SignupAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [builderOpen, setBuilderOpen] = useState(true);
  const [accountsOpen, setAccountsOpen] = useState(true);
  const [accountSearch, setAccountSearch] = useState("");

  useEffect(() => {
    let active = true;
    Promise.all([
      fetch("/api/pilot/login-config", { cache: "no-store" }),
      fetch("/api/pilot/usuarios-cadastro", { cache: "no-store" }),
    ])
      .then(async ([configResponse, accountsResponse]) => {
        const configResult = (await configResponse.json()) as {
          config?: PilotLoginConfig;
          error?: string;
        };
        const accountsResult = (await accountsResponse.json()) as {
          accounts?: SignupAccount[];
          error?: string;
        };
        if (!configResponse.ok) {
          throw new Error(configResult.error || "Falha ao carregar.");
        }
        if (!accountsResponse.ok) {
          throw new Error(accountsResult.error || "Falha ao carregar contas.");
        }
        if (active && configResult.config) setConfig(configResult.config);
        if (active) setAccounts(accountsResult.accounts || []);
      })
      .catch((error) => active && setMessage((error as Error).message))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    try {
      const response = await fetch("/api/pilot/login-config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      const result = (await response.json()) as {
        config?: PilotLoginConfig;
        error?: string;
      };
      if (!response.ok) throw new Error(result.error || "Falha ao salvar.");
      if (result.config) setConfig(result.config);
      setMessage("Login e ficha de cadastro atualizados com auditoria.");
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setSaving(false);
    }
  }

  function addField() {
    if (config.signupFields.length >= 12) {
      setMessage("O limite seguro é de 12 campos adicionais.");
      return;
    }
    const suffix = Date.now().toString(36);
    setConfig({
      ...config,
      signupFields: [
        ...config.signupFields,
        {
          id: `campo_${suffix}`,
          label: "Novo campo",
          type: "text",
          placeholder: "",
          required: false,
          enabled: true,
        },
      ],
    });
  }

  function updateField(index: number, patch: Partial<PilotSignupField>) {
    setConfig({
      ...config,
      signupFields: config.signupFields.map((field, fieldIndex) =>
        fieldIndex === index ? { ...field, ...patch } : field,
      ),
    });
  }

  function removeField(index: number) {
    setConfig({
      ...config,
      signupFields: config.signupFields.filter(
        (_, fieldIndex) => fieldIndex !== index,
      ),
    });
  }

  function moveField(index: number, direction: -1 | 1) {
    const destination = index + direction;
    if (destination < 0 || destination >= config.signupFields.length) return;
    const fields = [...config.signupFields];
    [fields[index], fields[destination]] = [
      fields[destination],
      fields[index],
    ];
    setConfig({ ...config, signupFields: fields });
  }

  async function removeSignupData(account: SignupAccount) {
    if (!window.confirm(`Excluir a ficha adicional de ${account.nome}? A conta e os históricos serão preservados.`)) return;
    const response = await fetch("/api/pilot/usuarios-cadastro", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: account.id }),
    });
    const result = await response.json().catch(() => ({})) as { error?: string };
    if (!response.ok) { setMessage(result.error || "Não foi possível excluir a ficha."); return; }
    setAccounts((current) => current.map((item) => item.id === account.id ? { ...item, dados: [] } : item));
    setMessage("Ficha adicional excluída. A conta e os históricos foram preservados.");
  }

  const visibleAccounts = accounts.filter((account) => {
    const term = accountSearch.trim().toLocaleLowerCase("pt-BR");
    return !term || account.nome.toLocaleLowerCase("pt-BR").includes(term) || account.email.toLocaleLowerCase("pt-BR").includes(term) || String(account.telefone || "").includes(term);
  });

  return (
    <section className="login-config-workspace">
      <header>
        <div>
          <p className="pilot-kicker">IDENTIDADE E CADASTRO</p>
          <h2>Portal de acesso</h2>
          <p>
            Personalize o login, escolha os dados solicitados e consulte as
            contas criadas sem expor credenciais.
          </p>
        </div>
        <span>{loading ? "Carregando…" : "Configuração persistente"}</span>
      </header>

      <form className="login-config-form" onSubmit={save}>
        <section className="login-config-section">
          <header>
            <span>1</span>
            <div>
              <h3>Identidade e mensagem</h3>
              <p>Textos, marca e chamada principal do acesso público.</p>
            </div>
            <button
              type="submit"
              className="login-section-save"
              disabled={loading || saving}
            >
              {saving ? "Salvando…" : "Salvar identidade"}
            </button>
          </header>
          <div className="login-config-fields">
            <label>
              Nome da plataforma
              <input value={config.siteName} maxLength={60} onChange={(event) => setConfig({ ...config, siteName: event.target.value })} required />
            </label>
            <label>
              Texto superior
              <input value={config.kicker} maxLength={70} onChange={(event) => setConfig({ ...config, kicker: event.target.value })} required />
            </label>
            <label className="login-config-wide">
              Título
              <input value={config.titulo} maxLength={100} onChange={(event) => setConfig({ ...config, titulo: event.target.value })} required />
            </label>
            <label className="login-config-wide">
              Texto de apoio
              <textarea value={config.subtitulo} maxLength={240} onChange={(event) => setConfig({ ...config, subtitulo: event.target.value })} required />
            </label>
            <NativeImageUpload
              label="Logo do portal"
              value={config.logoUrl}
              purpose="login-logo"
              onChange={(logoUrl) => setConfig({ ...config, logoUrl })}
            />
            <NativeImageUpload
              label="Imagem de fundo"
              value={config.backgroundImageUrl}
              purpose="login-background"
              onChange={(backgroundImageUrl) => setConfig({ ...config, backgroundImageUrl })}
            />
          </div>
        </section>

        <section className="login-config-section">
          <header>
            <span>2</span>
            <div>
              <h3>Layout e aparência</h3>
              <p>Tema, cartão translúcido, cores e intensidade da imagem.</p>
            </div>
          </header>
          <div className="login-config-fields">
            <label>
              Layout do acesso
              <select value="CENTERED" disabled aria-describedby="login-layout-note">
                <option value="CENTERED">Cartão centralizado — padrão V2</option>
              </select>
              <small id="login-layout-note">A imagem agora ocupa todo o fundo em computador e celular.</small>
            </label>
            <label>
              Estilo do cartão
              <select value={config.cardStyle} onChange={(event) => setConfig({ ...config, cardStyle: event.target.value as PilotLoginConfig["cardStyle"] })}>
                <option value="SOLID">Sólido</option>
                <option value="GLASS">Translúcido</option>
                <option value="MINIMAL">Minimalista</option>
              </select>
            </label>
            <label>
              Tema inicial
              <select value={config.themeMode} onChange={(event) => setConfig({ ...config, themeMode: event.target.value as PilotLoginConfig["themeMode"] })}>
                <option value="AUTO">Automático</option>
                <option value="CLARO">Claro</option>
                <option value="ESCURO">Escuro</option>
              </select>
            </label>
            <label>
              Posição da imagem
              <select value={config.backgroundPosition} onChange={(event) => setConfig({ ...config, backgroundPosition: event.target.value as PilotLoginConfig["backgroundPosition"] })}>
                <option value="CENTER">Centro</option>
                <option value="TOP">Topo</option>
                <option value="BOTTOM">Base</option>
              </select>
            </label>
            <label>
              Enquadramento da imagem
              <select value={config.backgroundFit} onChange={(event) => setConfig({ ...config, backgroundFit: event.target.value as PilotLoginConfig["backgroundFit"] })}>
                <option value="SMART">Mostrar imagem inteira — recomendado</option>
                <option value="COVER">Preencher toda a tela — pode recortar</option>
              </select>
            </label>
            <label>
              Escurecimento da imagem: {config.overlayStrength}%
              <input type="range" min="20" max="90" value={config.overlayStrength} onChange={(event) => setConfig({ ...config, overlayStrength: Number(event.target.value) })} />
            </label>
            <div className="login-palette-picker login-config-wide">
              <span>Paleta do portal</span>
              <div>
                {LOGIN_PALETTES.map((palette) => {
                  const active =
                    config.backgroundColor === palette.background &&
                    config.accentColor === palette.accent;
                  return (
                    <button
                      type="button"
                      className={active ? "active" : ""}
                      key={palette.id}
                      onClick={() =>
                        setConfig({
                          ...config,
                          backgroundColor: palette.background,
                          accentColor: palette.accent,
                          cardColor: palette.card,
                        })
                      }
                    >
                      <i style={{ background: palette.background }} />
                      <i style={{ background: palette.accent }} />
                      <strong>{palette.name}</strong>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </section>

        <aside
          className="login-config-preview"
          style={{
            "--preview-bg": config.backgroundColor,
            "--preview-accent": config.accentColor,
            "--preview-card": config.cardColor,
            backgroundPosition: `center, ${config.backgroundPosition.toLowerCase()}`,
            backgroundSize: `100% 100%, ${config.backgroundFit === "COVER" ? "cover" : "contain"}`,
            backgroundRepeat: "no-repeat, no-repeat",
            backgroundImage: config.backgroundImageUrl
              ? `linear-gradient(rgba(5,8,23,${config.overlayStrength / 100}),rgba(5,8,23,${Math.min(0.96, (config.overlayStrength + 12) / 100)})), url("${config.backgroundImageUrl}")`
              : undefined,
          } as React.CSSProperties}
        >
          <div>
            {config.logoUrl ? <img loading="lazy" src={config.logoUrl} alt="" /> : <b>{config.siteName.slice(0, 1)}</b>}
            <strong>{config.siteName}</strong>
          </div>
          <p>{config.kicker}</p>
          <h3>{config.titulo}</h3>
          <span>{config.subtitulo}</span>
        </aside>

        <section className="login-config-section login-link-settings">
          <header>
            <span>3</span>
            <div>
              <h3>Botões e opções públicas</h3>
              <p>Escolha textos e quais caminhos aparecem no acesso.</p>
            </div>
          </header>
          <div className="login-config-fields">
            <label>Texto do botão de entrar<input value={config.loginButtonText} maxLength={40} onChange={(event) => setConfig({ ...config, loginButtonText: event.target.value })} /></label>
            <label>Texto do cadastro<input value={config.signupLinkText} maxLength={50} onChange={(event) => setConfig({ ...config, signupLinkText: event.target.value })} /></label>
            <label>Texto da recuperação<input value={config.recoveryLinkText} maxLength={50} onChange={(event) => setConfig({ ...config, recoveryLinkText: event.target.value })} /></label>
            <label>Texto das comunidades<input value={config.exploreLinkText} maxLength={50} onChange={(event) => setConfig({ ...config, exploreLinkText: event.target.value })} /></label>
            <label className="login-config-toggle"><input type="checkbox" checked={config.cadastroHabilitado} onChange={(event) => setConfig({ ...config, cadastroHabilitado: event.target.checked })} /><span>Mostrar criação de conta</span></label>
            <label className="login-config-toggle"><input type="checkbox" checked={config.recuperacaoHabilitada} onChange={(event) => setConfig({ ...config, recuperacaoHabilitada: event.target.checked })} /><span>Mostrar recuperação de senha</span></label>
            <label className="login-config-toggle"><input type="checkbox" checked={config.explorarComunidadesHabilitado} onChange={(event) => setConfig({ ...config, explorarComunidadesHabilitado: event.target.checked })} /><span>Mostrar comunidades</span></label>
            <label className="login-config-toggle"><input type="checkbox" checked={config.avisoPilotoHabilitado} onChange={(event) => setConfig({ ...config, avisoPilotoHabilitado: event.target.checked })} /><span>Mostrar aviso de segurança</span></label>
            <label className="login-config-toggle"><input type="checkbox" checked={config.rememberMeEnabled} onChange={(event) => setConfig({ ...config, rememberMeEnabled: event.target.checked })} /><span>Mostrar “Lembrar de mim”</span></label>
          </div>
        </section>

        <section className="login-config-section login-social-settings">
          <header>
            <span>4</span>
            <div>
              <h3>Redes sociais oficiais</h3>
              <p>Divulgue somente endereços HTTPS oficiais no portal de acesso.</p>
            </div>
          </header>
          <div className="login-config-fields">
            <label className="login-config-wide">Título da área<input value={config.socialTitle} maxLength={60} onChange={(event) => setConfig({ ...config, socialTitle: event.target.value })} /></label>
            <label>Facebook<input inputMode="url" autoCapitalize="none" value={config.facebookUrl} maxLength={500} placeholder="https://facebook.com/..." onChange={(event) => setConfig({ ...config, facebookUrl: event.target.value })} /></label>
            <label>Instagram<input inputMode="url" autoCapitalize="none" value={config.instagramUrl} maxLength={500} placeholder="https://instagram.com/..." onChange={(event) => setConfig({ ...config, instagramUrl: event.target.value })} /></label>
            <label>YouTube<input inputMode="url" autoCapitalize="none" value={config.youtubeUrl} maxLength={500} placeholder="https://youtube.com/..." onChange={(event) => setConfig({ ...config, youtubeUrl: event.target.value })} /></label>
            <label>WhatsApp<input inputMode="url" autoCapitalize="none" value={config.whatsappUrl} maxLength={500} placeholder="https://wa.me/..." onChange={(event) => setConfig({ ...config, whatsappUrl: event.target.value })} /></label>
          </div>
        </section>

        <section className={`login-config-section login-signup-builder ${builderOpen ? "open" : "collapsed"}`}>
          <header>
            <span>5</span>
            <div>
              <h3>Ficha de criação de conta</h3>
              <p>
                Organize os dados solicitados no cadastro. Nome, e-mail e senha
                permanecem protegidos e obrigatórios.
              </p>
            </div>
            <div className="login-builder-actions">
              {builderOpen && <button type="button" onClick={addField}>+ Adicionar campo</button>}
              <button type="button" className="secondary" onClick={() => setBuilderOpen((value) => !value)}>{builderOpen ? "Recolher" : "Expandir"}</button>
            </div>
          </header>
          {builderOpen && <><div className="signup-required-fields" aria-label="Campos obrigatórios do sistema">
            {["Nome completo", "E-mail", "Senha"].map((field) => (
              <span key={field}>
                <i aria-hidden="true">✓</i>
                <strong>{field}</strong>
                <small>Obrigatório pelo sistema</small>
              </span>
            ))}
          </div>
          <div className="signup-field-list">
            {config.signupFields.map((field, index) => (
              <article key={field.id} className={field.enabled ? "" : "disabled"}>
                <span>{index + 1}</span>
                <label>Nome do campo<input value={field.label} maxLength={70} onChange={(event) => updateField(index, { label: event.target.value })} /></label>
                <label>Tipo<select value={field.type} onChange={(event) => updateField(index, { type: event.target.value as PilotSignupField["type"] })}><option value="text">Texto</option><option value="tel">Telefone</option><option value="number">Número</option><option value="date">Data</option><option value="textarea">Texto longo</option></select></label>
                <label className="signup-field-placeholder">Texto de exemplo<input value={field.placeholder} maxLength={100} onChange={(event) => updateField(index, { placeholder: event.target.value })} /></label>
                <label className="login-config-toggle"><input type="checkbox" checked={field.required} onChange={(event) => updateField(index, { required: event.target.checked })} /><span>Obrigatório</span></label>
                <label className="login-config-toggle"><input type="checkbox" checked={field.enabled} onChange={(event) => updateField(index, { enabled: event.target.checked })} /><span>Ativo</span></label>
                <div className="signup-field-order">
                  <button type="button" disabled={index === 0} onClick={() => moveField(index, -1)} aria-label={`Mover ${field.label} para cima`}>↑</button>
                  <button type="button" disabled={index === config.signupFields.length - 1} onClick={() => moveField(index, 1)} aria-label={`Mover ${field.label} para baixo`}>↓</button>
                </div>
                <button className="signup-field-remove" type="button" onClick={() => removeField(index)} aria-label={`Remover ${field.label}`}>×</button>
              </article>
            ))}
            {config.signupFields.length === 0 && <p className="signup-fields-empty">Nenhum campo adicional. Nome, e-mail e senha continuam obrigatórios.</p>}
          </div></>}
        </section>

        <div className="login-config-save">
          <div>
            <strong>Cadastro sujeito à aprovação</strong>
            <span>Criar conta não adiciona a pessoa a uma comunidade.</span>
          </div>
          <button disabled={loading || saving}>{saving ? "Salvando…" : "Salvar portal de acesso"}</button>
        </div>
        {message && <p className="pilot-form-message" role="status">{message}</p>}
      </form>

      <section className={`signup-accounts ${accountsOpen ? "open" : "collapsed"}`}>
        <header>
          <div>
            <p className="pilot-kicker">ACESSO RESTRITO AO SUPERADMIN</p>
            <h3>Cadastros recebidos</h3>
            <p>
              Consulte os dados enviados e o estado de cada conta. Credenciais
              nunca aparecem nesta área.
            </p>
          </div>
          <div className="signup-account-header-actions"><strong>{accounts.length} contas recentes</strong><button type="button" onClick={() => setAccountsOpen((value) => !value)}>{accountsOpen ? "Recolher" : "Expandir"}</button></div>
        </header>
        {accountsOpen && <>
        <label className="signup-account-search"><span className="sr-only">Pesquisar cadastros</span><input type="search" value={accountSearch} onChange={(event) => setAccountSearch(event.target.value)} placeholder="Pesquisar por nome, e-mail ou telefone" /></label>
        <div className="signup-account-summary">
          <span>
            <strong>{accounts.filter((account) => account.ativo).length}</strong>
            <small>Ativas</small>
          </span>
          <span>
            <strong>{accounts.filter((account) => !account.ativo).length}</strong>
            <small>Aguardando aprovação</small>
          </span>
          <span>
            <strong>{accounts.reduce((total, account) => total + account.dados.length, 0)}</strong>
            <small>Campos informados</small>
          </span>
        </div>
        <div className="signup-account-list">
          {visibleAccounts.map((account) => (
            <details key={account.id}>
              <summary>
                <span>{getInitials(account.nome)}</span>
                <div><strong>{account.nome}</strong><small>{account.email}</small></div>
                <em>{account.ativo ? "Ativa" : "Inativa"}</em>
              </summary>
              <dl>
                {account.dados.length ? account.dados.map((item) => (
                  <div key={item.id}><dt>{item.label}</dt><dd>{item.value}</dd></div>
                )) : <div><dt>Dados adicionais</dt><dd>Não informados</dd></div>}
                <div><dt>Cadastro</dt><dd>{formatDate(account.criadoEm)}</dd></div>
              </dl>
              <button type="button" className="signup-delete-data" disabled={!account.dados.length} onClick={() => void removeSignupData(account)}>Excluir ficha adicional</button>
            </details>
          ))}
          {!loading && visibleAccounts.length === 0 && <p>Nenhuma conta encontrada.</p>}
        </div>
        <p className="signup-privacy-note">
          Senhas, hashes, tokens e sessões não são exibidos nem enviados ao
          navegador.
        </p>
        </>}
      </section>

      <p className="external-dependency-note">
        Imagens são enviadas ao armazenamento privado da plataforma. E-mail e
        WhatsApp continuam dependentes de provedores externos; nenhum token é
        enviado ao navegador.
      </p>
    </section>
  );
}

function getInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function formatDate(value: string) {
  try {
    return new Intl.DateTimeFormat("pt-BR", {
      dateStyle: "short",
      timeStyle: "short",
    }).format(new Date(value));
  } catch {
    return value;
  }
}
