import { useState } from "react";

interface Props {
  step: "email" | "password";
  email: string;
  setEmail: (v: string) => void;
  onNext: () => void;
  onGoogleSuccess: () => void;
}

export default function LoginForm({ step, email, setEmail, onNext, onGoogleSuccess }: Props) {
  const [password, setPassword] = useState("");
  const displayEmail = email || "pastoral@suaigreja.com.br";

  return (
    <form
      className="animate-slide-up"
      style={{ animationDuration: "0.4s" }}
      onSubmit={(event) => {
        event.preventDefault();
        onNext();
      }}
    >
      <h2 className="font-display font-bold text-2xl text-foreground tracking-tight mb-1">
        {step === "email" ? "Bem-vindo de volta" : "Sua senha"}
      </h2>
      <p className="text-[15px] text-foreground-subtle mb-8">
        {step === "email"
          ? "Digite seu e-mail para continuar."
          : `Entrando como ${displayEmail}`}
      </p>

      <div className="flex flex-col gap-4">
        {step === "email" ? (
          <Field
            label="E-mail"
            type="email"
            placeholder="pastoral@suaigreja.com.br"
            value={email}
            onChange={setEmail}
            autoComplete="email"
          />
        ) : (
          <Field
            label="Senha"
            type="password"
            placeholder="••••••••"
            value={password}
            onChange={setPassword}
            autoComplete="current-password"
          />
        )}

        {step === "password" && (
          <div className="text-right -mt-2">
            <button type="button" className="text-sm font-semibold text-primary hover:text-primary-hover transition-colors">
              Esqueci minha senha
            </button>
          </div>
        )}

        <button
          type="submit"
          className="mt-2 w-full h-12 rounded-xl bg-primary hover:bg-primary-hover text-primary-foreground font-bold text-[15px] transition-colors shadow-lg shadow-primary/20"
        >
          {step === "email" ? "Continuar →" : "Entrar na comunidade"}
        </button>
      </div>

      {step === "email" && (
        <>
          <Divider />
          <SocialBtn
            icon="google"
            label="Continuar com Google"
            onClick={onGoogleSuccess}
          />
        </>
      )}
    </form>
  );
}

function Field({
  label,
  type,
  placeholder,
  value,
  onChange,
  autoComplete,
}: {
  label: string;
  type: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete: string;
}) {
  return (
    <div>
      <label className="block text-xs font-bold tracking-wider uppercase text-foreground-muted mb-2">
        {label}
      </label>
      <input
        type={type}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        className="w-full h-12 rounded-xl border border-border bg-background text-foreground px-4 text-[15px] outline-none focus:border-primary focus:ring-1 focus:ring-primary/50 transition-all placeholder:text-border"
      />
    </div>
  );
}

function Divider() {
  return (
    <div className="flex items-center gap-4 my-6 opacity-80">
      <div className="flex-1 h-px bg-border" />
      <span className="text-[13px] font-medium text-foreground-muted uppercase tracking-wider">ou</span>
      <div className="flex-1 h-px bg-border" />
    </div>
  );
}

function SocialBtn({ icon, label, onClick }: { icon: string; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full h-12 rounded-xl border border-border bg-background hover:bg-surface-subtle text-foreground font-semibold text-[15px] flex items-center justify-center gap-3 transition-colors"
    >
      {icon === "google" && (
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
          <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 01-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
          <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.909-2.259c-.806.54-1.837.86-3.047.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z" fill="#34A853"/>
          <path d="M3.964 10.71A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
          <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
        </svg>
      )}
      {label}
    </button>
  );
}
