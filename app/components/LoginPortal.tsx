"use client";

import { FormEvent, useEffect, useState } from "react";
import type { PilotSignupField } from "../lib/pilot-login-config";
import Link from "./StableLink";

type LoginConfig = {
  kicker?: string;
  titulo?: string;
  subtitulo?: string;
  logoUrl?: string;
  backgroundImageUrl?: string;
  backgroundColor?: string;
  accentColor?: string;
  cardColor?: string;
  cardStyle?: "SOLID" | "GLASS" | "MINIMAL";
  backgroundPosition?: "CENTER" | "TOP" | "BOTTOM";
  backgroundFit?: "SMART" | "COVER";
  overlayStrength?: number;
  themeMode?: "AUTO" | "CLARO" | "ESCURO";
  rememberMeEnabled?: boolean;
  loginButtonText?: string;
  signupLinkText?: string;
  recoveryLinkText?: string;
  exploreLinkText?: string;
  socialTitle?: string;
  facebookUrl?: string;
  instagramUrl?: string;
  youtubeUrl?: string;
  whatsappUrl?: string;
  cadastroHabilitado?: boolean;
  recuperacaoHabilitada?: boolean;
  explorarComunidadesHabilitado?: boolean;
  avisoPilotoHabilitado?: boolean;
  signupFields?: PilotSignupField[];
};

type ScheduledMessage = {
  id: number;
  titulo: string;
  mensagem: string;
  tipo: string;
  animacao: string;
  intervalo_segundos: number;
};

type Maintenance = {
  ativa: boolean;
  mensagem: string;
  terminaEm: string | null;
};

type Mode = "login" | "esqueci" | "cadastro";
type LoginTheme = "auto" | "claro" | "escuro";

function isInstalledVinkuloApp() {
  return Boolean(window.VinkuloAndroid) ||
    ["standalone", "fullscreen", "minimal-ui"].some((mode) => window.matchMedia(`(display-mode: ${mode})`).matches) ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true ||
    document.referrer.startsWith("android-app://");
}

async function submit(url: string, payload: Record<string, unknown>) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 15000);
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      credentials: "same-origin",
      signal: controller.signal,
    });
  } catch (error) {
    if ((error as Error).name === "AbortError") {
      throw new Error("A conexão demorou demais. Verifique sua internet e tente novamente.");
    }
    throw new Error("Não foi possível conectar ao sistema. Verifique sua internet e tente novamente.");
  } finally {
    window.clearTimeout(timeout);
  }
  const text = await response.text();
  let body: {
    error?: string;
    message?: string;
    redirect?: string;
    firstAccessRequired?: boolean;
  } = {};
  try {
    body = text ? JSON.parse(text) as typeof body : {};
  } catch {
    body = {};
  }
  if (!response.ok) throw new Error(body.error || "Não foi possível concluir.");
  return body;
}

export default function LoginPortal({
  config,
  siteName,
  scheduledMessages,
  maintenance,
  initialMessage = "",
  returnTo = "",
  initialMode = "login",
  googleAvailable = false,
}: {
  config: LoginConfig;
  siteName: string;
  scheduledMessages: ScheduledMessage[];
  maintenance: Maintenance;
  initialMessage?: string;
  returnTo?: string;
  initialMode?: Mode;
  googleAvailable?: boolean;
}) {
  const [mode, setMode] = useState<Mode>(initialMode);
  const [message, setMessage] = useState(initialMessage);
  const [loading, setLoading] = useState(false);
  const [androidApp, setAndroidApp] = useState(false);
  const [googlePairing, setGooglePairing] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [activeMessageIndex, setActiveMessageIndex] = useState(0);
  const [loginTheme, setLoginTheme] = useState<LoginTheme>(
    (config.themeMode || "AUTO").toLowerCase() as LoginTheme,
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const saved = window.localStorage.getItem("vinkulo-login-theme");
      if (saved === "auto" || saved === "claro" || saved === "escuro") {
        setLoginTheme(saved);
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const insideAndroidApp = isInstalledVinkuloApp();
      setAndroidApp(insideAndroidApp);
      if (insideAndroidApp) {
        setGooglePairing(window.sessionStorage.getItem("vinkulo-google-pairing") || "");
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const resetAfterBrowserReturn = () => {
      if (!googlePairing) setLoading(false);
    };
    window.addEventListener("pageshow", resetAfterBrowserReturn);
    return () => window.removeEventListener("pageshow", resetAfterBrowserReturn);
  }, [googlePairing]);

  useEffect(() => {
    if (!androidApp || !googlePairing) return;
    let stopped = false;
    let timer = 0;
    const poll = async () => {
      try {
        const response = await fetch("/api/auth/google/native/complete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pairing: googlePairing }),
          credentials: "same-origin",
        });
        const body = await response.json() as { status?: string; error?: string; returnTo?: string };
        if (body.status === "complete") {
          window.sessionStorage.removeItem("vinkulo-google-pairing");
          const target = String(body.returnTo || returnTo || "/painel");
          window.location.assign(target.startsWith("/") && !target.startsWith("//") ? target : "/painel");
          return;
        }
        if (body.status === "failed" || body.status === "expired" || body.status === "invalid") {
          window.sessionStorage.removeItem("vinkulo-google-pairing");
          setGooglePairing("");
          setLoading(false);
          setMessage(body.error || "Não foi possível concluir o login com Google.");
          return;
        }
      } catch {
        // Mantém a espera quando o aplicativo alternar entre o Chrome e o Vínkulo.
      }
      if (!stopped) timer = window.setTimeout(() => void poll(), 1500);
    };
    void poll();
    return () => {
      stopped = true;
      window.clearTimeout(timer);
    };
  }, [androidApp, googlePairing, returnTo]);

  useEffect(() => {
    if (scheduledMessages.length < 2) return;
    const current = scheduledMessages[activeMessageIndex % scheduledMessages.length];
    const timer = window.setTimeout(
      () => setActiveMessageIndex((index) => (index + 1) % scheduledMessages.length),
      Math.max(3, Number(current.intervalo_segundos) || 7) * 1000,
    );
    return () => window.clearTimeout(timer);
  }, [activeMessageIndex, scheduledMessages]);

  async function handle(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage("");
    const data = Object.fromEntries(new FormData(event.currentTarget).entries());
    let navigating = false;
    try {
      if (mode === "login") {
        const result = await submit("/api/auth/login", data);
        const target = String(result.redirect || returnTo || "/painel");
        setMessage("Login confirmado. Abrindo sua conta…");
        navigating = true;
        window.setTimeout(() => {
          window.location.assign(
            target.startsWith("/") && !target.startsWith("//")
              ? target
              : "/painel",
          );
        }, 180);
      } else if (mode === "esqueci") {
        const result = await submit("/api/auth/esqueci-senha", data);
        setMessage(result.message || "Solicitação enviada ao administrador.");
      } else if (mode === "cadastro") {
        if (data.senha !== data.confirmarSenha) throw new Error("As senhas não conferem.");
        const result = await submit("/api/auth/cadastro", {
          ...data,
          aceiteTermos: data.aceiteTermos === "on",
        });
        setMode("login");
        setMessage(result.message || "Conta criada. Agora você pode entrar.");
      }
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      if (!navigating) setLoading(false);
    }
  }

  function changeMode(next: Mode) {
    setMode(next);
    setMessage("");
  }

  function changeTheme(next: LoginTheme) {
    setLoginTheme(next);
    window.localStorage.setItem("vinkulo-login-theme", next);
  }

  async function startGoogleLogin() {
    setLoading(true);
    setMessage("Abrindo a Conta Google com segurança…");
    if (!androidApp) {
      window.location.assign(`/api/auth/google/start?purpose=login&returnTo=${encodeURIComponent(returnTo || "/painel")}`);
      return;
    }
    setMessage("Abra o Google no navegador. O Vínkulo concluirá o acesso automaticamente.");
    try {
      const bytes = crypto.getRandomValues(new Uint8Array(32));
      const pairing = btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
      const query = new URLSearchParams({
        purpose: "login",
        returnTo: returnTo || "/painel",
        channel: "android",
        pairing,
        format: "json",
      });
      const response = await fetch(`/api/auth/google/start?${query}`, { credentials: "same-origin" });
      const body = await response.json() as { authorizationUrl?: string; error?: string };
      if (!response.ok || !body.authorizationUrl) throw new Error(body.error || "Não foi possível abrir o Google.");
      window.sessionStorage.setItem("vinkulo-google-pairing", pairing);
      setGooglePairing(pairing);
      window.location.href = body.authorizationUrl;
    } catch (error) {
      setLoading(false);
      setMessage((error as Error).message);
    }
  }

  const activeScheduledMessage = scheduledMessages.length
    ? scheduledMessages[activeMessageIndex % scheduledMessages.length]
    : null;
  const temporaryAccessLogin = returnTo.startsWith("/acesso/");
  const cardStyleClass = `card-${(config.cardStyle || "GLASS").toLowerCase()}`;
  const socialLinks = [
    { label: "Facebook", icon: "f", href: config.facebookUrl },
    { label: "Instagram", icon: "◎", href: config.instagramUrl },
    { label: "YouTube", icon: "▶", href: config.youtubeUrl },
    { label: "WhatsApp", icon: "◉", href: config.whatsappUrl },
  ].filter((item): item is { label: string; icon: string; href: string } => Boolean(item.href));
  const shellStyle = {
    "--login-bg": config.backgroundColor || "#050817",
    "--login-accent": config.accentColor || "#b25a33",
    "--login-card": config.cardColor || "#ffffff",
  } as React.CSSProperties;

  return (
    <main
      className={`login-shell login-shell-v2 mode-${mode} ${cardStyleClass}`}
      data-ui-version="v2"
      data-login-theme={loginTheme}
      style={shellStyle}
    >
      {config.backgroundImageUrl && (
        <figure className="login-v2-top-banner">
          <img
            src={config.backgroundImageUrl}
            alt={`Banner de acesso do ${siteName}`}
            loading="eager"
            fetchPriority="high"
          />
        </figure>
      )}

      <div className="login-v2-controls-row">
        <div className="login-v2-page-brand" aria-label={siteName}>
          {config.logoUrl
            ? <img src={config.logoUrl} alt="" />
            : <span aria-hidden="true">{siteName.slice(0, 1).toUpperCase()}</span>}
          <div>
            <strong>{siteName}</strong>
            <small>{config.kicker || "PORTAL DA COMUNIDADE"}</small>
          </div>
        </div>
        <nav className="login-v2-theme" aria-label="Tema do acesso">
          <button type="button" className={loginTheme === "claro" ? "active" : ""} aria-label="Tema claro" aria-pressed={loginTheme === "claro"} onClick={() => changeTheme("claro")}>☀</button>
          <button type="button" className={loginTheme === "auto" ? "active" : ""} aria-label="Tema automático" aria-pressed={loginTheme === "auto"} onClick={() => changeTheme("auto")}>◐</button>
          <button type="button" className={loginTheme === "escuro" ? "active" : ""} aria-label="Tema escuro" aria-pressed={loginTheme === "escuro"} onClick={() => changeTheme("escuro")}>☾</button>
        </nav>
      </div>

      <section className="login-v2-stage" data-auth-mode={mode}>
        {mode === "login" && <aside className="login-v2-intro" aria-label="Recursos do Vínkulo">
          <header>
            <p>ACESSO CENTRALIZADO</p>
            <h2>Sua comunidade organizada em um só lugar.</h2>
            <span>Entre para acompanhar pessoas, eventos, equipes e escalas com segurança.</span>
          </header>
          {/* Os três itens diziam "Seguro por contexto", "Feito para pessoas" e
              "Rotina conectada" — elogios que não informam nada a quem está
              parado na tela de senha. Agora dizem o que a conta faz e o que
              fazer quando ela ainda não existe, que é a dúvida real aqui. */}
          <div className="login-v2-benefits">
            <span><i>✓</i><div><strong>Uma conta, suas comunidades</strong><small>Você vê apenas os dados das comunidades de que participa</small></div></span>
            <span><i>◎</i><div><strong>O que depende de você</strong><small>Eventos, equipes e escalas em que seu nome está</small></div></span>
            <span><i>▣</i><div><strong>Ainda não tem acesso?</strong><small>Crie a conta e peça entrada: a liderança da comunidade aprova</small></div></span>
          </div>
        </aside>}

        <div className={`login-card login-v2-card ${mode === "cadastro" ? "signup-card" : ""}`}>
          {maintenance.ativa && (
            <div className="login-maintenance-alert" role="status">
              <span aria-hidden="true">◇</span>
              <div><strong>Sistema em manutenção</strong><p>{maintenance.mensagem}</p><small>Acesso temporariamente restrito a administradores.{maintenance.terminaEm ? ` Previsão: ${formatDateTime(maintenance.terminaEm)}.` : ""}</small></div>
            </div>
          )}

          <header className="login-v2-heading">
            <h1>{mode === "login" ? config.titulo || `Bem-vindo de volta ao ${siteName}` : mode === "cadastro" ? "Criar minha conta" : "Recuperar minha senha"}</h1>
            <p>{mode === "login" ? config.subtitulo || "Entre com sua conta para continuar." : mode === "cadastro" ? "Crie sua conta individual e aguarde aprovação para entrar em uma comunidade." : "Informe seu e-mail para solicitar uma redefinição segura."}</p>
          </header>

          {activeScheduledMessage && (
            <section className="login-v2-message" aria-live="polite">
              <span aria-hidden="true">{activeScheduledMessage.tipo === "URGENTE" ? "!" : "◇"}</span>
              <div><small>{activeScheduledMessage.tipo}</small><strong>{activeScheduledMessage.titulo}</strong><p>{activeScheduledMessage.mensagem}</p></div>
            </section>
          )}

          {mode === "login" && temporaryAccessLogin && (
            <section className="login-temporary-access-context" role="status">
              <span aria-hidden="true">✓</span>
              <div><strong>Entre para confirmar sua escala</strong><p>Use a conta que recebeu o link. Depois do login, você voltará automaticamente ao acesso temporário.</p></div>
            </section>
          )}

          <form
            className={`login-form ${mode === "cadastro" ? "login-signup-form" : ""}`}
            onSubmit={handle}
          >
            {mode === "login" && returnTo && (
              <input type="hidden" name="returnTo" value={returnTo} />
            )}
            {mode === "cadastro" && <label>Nome completo<input name="nome" required minLength={3} maxLength={120} autoComplete="name" /></label>}
            <label>E-mail<input name="email" type="email" required autoComplete="email" placeholder="voce@exemplo.com" /></label>
            {mode === "cadastro" && (config.signupFields || []).filter((field) => field.enabled).map((field) => (
              <label key={field.id} className={field.type === "textarea" ? "login-signup-wide" : ""}>
                {field.label}{field.required ? "*" : ""}
                {field.type === "textarea"
                  ? <textarea name={`cadastro_${field.id}`} required={field.required} maxLength={500} placeholder={field.placeholder} />
                  : <input name={`cadastro_${field.id}`} type={field.type} required={field.required} maxLength={field.type === "date" || field.type === "number" ? undefined : 500} placeholder={field.placeholder} autoComplete={signupAutocomplete(field.id, field.type)} />}
              </label>
            ))}
            {mode !== "esqueci" && <label>Senha<div className="password-field"><input name="senha" type={showPassword ? "text" : "password"} required autoComplete={mode === "cadastro" ? "new-password" : "current-password"} minLength={8} placeholder="Digite sua senha" /><button type="button" onClick={() => setShowPassword((value) => !value)}>{showPassword ? "Ocultar" : "Mostrar"}</button></div></label>}
            {mode === "cadastro" && <>
              <label>Confirmar senha<input name="confirmarSenha" type={showPassword ? "text" : "password"} required autoComplete="new-password" minLength={8} /></label>
              <label className="login-terms-check"><input name="aceiteTermos" type="checkbox" required /><span>Li e aceito os <Link href="/termos">Termos de Uso</Link> e a <Link href="/privacidade">Política de Privacidade</Link>.</span></label>
            </>}
            {mode === "login" && <div className="login-v2-options">
              {config.rememberMeEnabled !== false ? <label className="login-v2-remember"><input name="lembrar" type="checkbox" /><span>Lembrar de mim</span></label> : <span />}
              {config.recuperacaoHabilitada !== false && <button type="button" onClick={() => changeMode("esqueci")}>{config.recoveryLinkText || "Esqueci minha senha"}</button>}
            </div>}
            {message && <p className="login-feedback" role="alert">{message}</p>}
            <button className="login-submit" disabled={loading}>{loading ? mode === "login" ? "Entrando…" : "Processando…" : mode === "login" ? config.loginButtonText || "Entrar" : mode === "cadastro" ? "Criar conta" : "Solicitar redefinição"}</button>
          </form>

          {mode === "login" && (
            <section className="login-google-access" aria-label="Entrar com Conta Google">
              <span>ou</span>
              {googleAvailable ? (
                <button type="button" onClick={() => void startGoogleLogin()} disabled={loading}>
                  <b aria-hidden="true">G</b> {androidApp && googlePairing ? "Aguardando o Google…" : "Entrar com Google"}
                </button>
              ) : (
                <button type="button" disabled title="A integração Google ainda precisa ser ativada pelo proprietário.">
                  <b aria-hidden="true">G</b> Conta Google aguardando ativação
                </button>
              )}
              <small>O login não autoriza o Drive. O armazenamento é solicitado separadamente e somente com seu consentimento.</small>
              <small>Ao continuar, você aceita os <Link href="/termos">Termos de Uso</Link> e a <Link href="/privacidade">Política de Privacidade</Link>. Contas novas ficam sem acesso a comunidades até aprovação.</small>
            </section>
          )}

          <div className="login-links">
            {mode !== "login" && <button onClick={() => changeMode("login")}>Voltar para entrar</button>}
            {mode === "login" && <>
              {config.cadastroHabilitado !== false && !temporaryAccessLogin && <button onClick={() => changeMode("cadastro")}>{config.signupLinkText || "Criar minha conta"}</button>}
              {config.explorarComunidadesHabilitado !== false && <Link href="/comunidades">{config.exploreLinkText || "Explorar comunidades"}</Link>}
            </>}
          </div>
          {mode === "login" && socialLinks.length > 0 && <section className="login-v2-social" aria-label="Redes sociais oficiais">
            <small>{config.socialTitle || "Acompanhe nossas redes"}</small>
            <div>{socialLinks.map((item) => <a key={item.label} href={item.href} target="_blank" rel="noreferrer" aria-label={item.label}><span aria-hidden="true">{item.icon}</span>{item.label}</a>)}</div>
          </section>}
          {config.avisoPilotoHabilitado !== false && <details className="login-pilot-notice"><summary>Segurança e acesso</summary><p>Criar uma conta não concede acesso automático a nenhuma comunidade. Ações sensíveis exigem autorização adicional.</p></details>}
        </div>
      </section>

      <footer className="login-v2-footer">© {new Date().getFullYear()} {siteName} · <Link href="/privacidade">Política de Privacidade</Link> · <Link href="/termos">Termos de Uso</Link></footer>
    </main>
  );
}

function signupAutocomplete(id: string, type: PilotSignupField["type"]) {
  if (id === "telefone" || type === "tel") return "tel";
  if (id === "cep") return "postal-code";
  if (id === "endereco") return "street-address";
  if (id === "cidade") return "address-level2";
  if (id === "estado") return "address-level1";
  return "off";
}

function formatDateTime(value: string) {
  try {
    return new Intl.DateTimeFormat("pt-BR", {
      dateStyle: "short",
      timeStyle: "short",
    }).format(new Date(value));
  } catch {
    return value;
  }
}
