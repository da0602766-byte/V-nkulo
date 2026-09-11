import { useState } from "react";
import LoginForm from "../components/LoginForm";
import RegisterForm from "../components/RegisterForm";

interface Props {
  onGoToLanding: () => void;
  onLoginSuccess: (email: string) => void;
}

export default function ReceptionPage({ onGoToLanding, onLoginSuccess }: Props) {
  const [tab, setTab] = useState<"login" | "register">("login");
  const [loginStep, setLoginStep] = useState<"email" | "password">("email");
  const [email, setEmail] = useState("");

  return (
    <div className="min-h-full flex flex-col text-foreground font-sans relative overflow-hidden">
      {/* Background fio vertical e ambiente */}
      <div className="absolute inset-0 pointer-events-none" aria-hidden>
        {/* Gradiente radial sutil */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_100%_60%_at_50%_0%,rgba(37,99,235,0.18)_0%,transparent_70%)]" />
        
        {/* Fio do dia — linha vertical estática */}
        <div className="absolute left-1/2 top-0 -translate-x-1/2 w-[1px] h-full hidden md:block">
          <div className="w-[1px] h-[35%] bg-gradient-to-b from-transparent to-[#2563EB]/50 animate-drawLine" />
          <div className="w-[1px] h-[65%] border-l border-dashed border-accent/20" />
        </div>

        {/* Ponto atual no fio */}
        <div className="absolute left-1/2 -translate-x-1/2 top-[35%] z-[2] hidden md:block">
          <div className="w-2.5 h-2.5 rounded-full bg-accent animate-pulse-glow" style={{ boxShadow: "0 0 16px 4px rgba(249,115,22,0.3)" }} />
        </div>
      </div>

      {/* Topo */}
      <header className="relative z-10 flex items-center justify-between px-6 pt-10 pb-4 max-w-6xl mx-auto w-full">
        {/* Logo */}
        <div className="flex items-center gap-2">
          <VinkuloMark />
          <span className="font-display font-extrabold text-2xl tracking-tight text-foreground">
            vínkulo
          </span>
        </div>

        <button
          onClick={onGoToLanding}
          className="text-sm font-medium text-foreground-subtle hover:text-primary-light transition-colors py-2"
        >
          Conheça o sistema →
        </button>
      </header>

      {/* Layout principal (2 colunas em desktop) */}
      <main className="relative z-10 flex-1 flex flex-col md:flex-row md:items-center max-w-6xl mx-auto w-full gap-10 md:gap-20 px-6 py-8">
        
        {/* Hero text */}
        <div className="flex-1 max-w-xl md:py-12 animate-slide-up">
          <div className="inline-block px-3 py-1 bg-yellow/10 border border-yellow/20 rounded-full mb-6">
            <p className="text-xs font-bold tracking-widest uppercase text-yellow">
              Gestão para igrejas
            </p>
          </div>
          <h1 className="font-display font-extrabold text-4xl md:text-5xl lg:text-6xl leading-[1.05] tracking-tight text-foreground mb-6">
            Sua comunidade, <span className="text-accent">conectada</span> e organizada.
          </h1>
          <p className="text-lg md:text-xl text-foreground-subtle leading-relaxed">
            Células, ministérios, escalas, visitantes e muito mais — tudo em um só lugar, de forma intuitiva.
          </p>
        </div>

        {/* Card de auth */}
        <div className="w-full max-w-md bg-surface border border-border rounded-3xl overflow-hidden shadow-2xl shadow-slate-200/50 mx-auto animate-slide-up" style={{ animationDelay: "0.1s" }}>
          {/* Abas */}
          <div className="flex border-b border-border px-2 pt-2 bg-surface-subtle/50">
            {(["login", "register"] as const).map((t) => (
              <button
                key={t}
                onClick={() => {
                  setTab(t);
                  setLoginStep("email");
                  setEmail("");
                }}
                className={`flex-1 py-4 text-sm font-bold tracking-wide transition-all border-b-2 -mb-[1px]
                  ${tab === t ? "text-foreground border-[#3B82F6]" : "text-foreground-muted border-transparent hover:text-foreground-subtle"}
                `}
              >
                {t === "login" ? "Entrar" : "Criar conta"}
              </button>
            ))}
          </div>

          {/* Conteúdo Form */}
          <div className="p-8">
            {tab === "login" ? (
              <LoginForm
                step={loginStep}
                email={email}
                setEmail={setEmail}
                onGoogleSuccess={() => onLoginSuccess("google.demo@suaigreja.com.br")}
                onNext={() => {
                  if (loginStep === "email") {
                    setLoginStep("password");
                  } else {
                    onLoginSuccess(email || "pastoral@suaigreja.com.br");
                  }
                }}
              />
            ) : (
              <RegisterForm
                onBack={() => setTab("login")}
                onComplete={onLoginSuccess}
              />
            )}
          </div>
        </div>
      </main>

      {/* Rodapé */}
      <div className="relative z-10 text-center pb-8 pt-4">
        <p className="text-[13px] text-foreground-muted">
          Ao continuar, você aceita os <span className="text-primary hover:text-primary-hover cursor-pointer transition-colors">Termos de uso</span> e a <span className="text-primary hover:text-primary-hover cursor-pointer transition-colors">Política de privacidade</span>.
        </p>
      </div>
    </div>
  );
}

function VinkuloMark() {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden>
      <rect width="28" height="28" rx="8" fill="var(--primary)" />
      <line x1="14" y1="5" x2="14" y2="12" stroke="var(--accent)" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="14" cy="14" r="2.5" fill="var(--accent)" />
      <line x1="14" y1="16" x2="14" y2="23" stroke="var(--accent)" strokeWidth="1.6" strokeLinecap="round" strokeDasharray="2 2" />
      <line x1="7" y1="14" x2="11" y2="14" stroke="#FFFFFF" strokeWidth="1.6" strokeLinecap="round" />
      <line x1="17" y1="14" x2="21" y2="14" stroke="#FFFFFF" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="6" cy="14" r="1.5" fill="#FFFFFF" opacity="0.6" />
      <circle cx="22" cy="14" r="1.5" fill="#FFFFFF" opacity="0.6" />
    </svg>
  );
}
