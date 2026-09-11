import { useState } from "react";

interface Props {
  onBack: () => void;
  onComplete: (email: string) => void;
}

type RegisterData = {
  name: string;
  email: string;
  password: string;
  community: string;
  city: string;
  role: string;
};

export default function RegisterForm({ onBack, onComplete }: Props) {
  const [step, setStep] = useState<1 | 2>(1);
  const [data, setData] = useState<RegisterData>({
    name: "",
    email: "",
    password: "",
    community: "",
    city: "",
    role: "pastor",
  });

  const update = (field: keyof RegisterData, value: string) => {
    setData((current) => ({ ...current, [field]: value }));
  };

  return (
    <form
      className="animate-slide-up"
      style={{ animationDuration: "0.4s" }}
      onSubmit={(event) => {
        event.preventDefault();
        if (step === 1) {
          setStep(2);
          return;
        }
        onComplete(data.email || "pastoral@suaigreja.com.br");
      }}
    >
      <h2 className="font-display font-bold text-2xl text-foreground tracking-tight mb-1">
        {step === 1 ? "Criar sua conta" : "Dados da comunidade"}
      </h2>
      <p className="text-[15px] text-foreground-subtle mb-8">
        {step === 1
          ? "Passo 1 de 2 — Suas informações pessoais."
          : "Passo 2 de 2 — Qual é a sua igreja?"}
      </p>

      {/* Steps indicator */}
      <div className="flex gap-2 mb-8">
        {[1, 2].map((s) => (
          <div
            key={s}
            className={`h-1.5 flex-1 rounded-full transition-colors duration-300 ${
              s <= step ? "bg-primary" : "bg-border"
            }`}
          />
        ))}
      </div>

      <div className="flex flex-col gap-4">
        {step === 1 ? (
          <>
            <Field label="Nome completo" type="text" placeholder="Maria Aparecida Santos" value={data.name} onChange={(value) => update("name", value)} autoComplete="name" />
            <Field label="E-mail" type="email" placeholder="maria@videiracentral.com.br" value={data.email} onChange={(value) => update("email", value)} autoComplete="email" />
            <Field label="Senha" type="password" placeholder="Mínimo 8 caracteres" value={data.password} onChange={(value) => update("password", value)} autoComplete="new-password" />
          </>
        ) : (
          <>
            <Field label="Nome da comunidade" type="text" placeholder="Igreja Videira Central" value={data.community} onChange={(value) => update("community", value)} autoComplete="organization" />
            <Field label="Cidade" type="text" placeholder="São Paulo, SP" value={data.city} onChange={(value) => update("city", value)} autoComplete="address-level2" />
            <div>
              <label className="block text-xs font-bold tracking-wider uppercase text-foreground-muted mb-2">
                Seu papel
              </label>
              <select
                value={data.role}
                onChange={(event) => update("role", event.target.value)}
                className="w-full h-12 rounded-xl border border-border bg-background text-foreground px-4 text-[15px] outline-none focus:border-primary focus:ring-1 focus:ring-primary/50 transition-all cursor-pointer appearance-none"
                style={{
                  backgroundImage: `url("data:image/svg+xml,%3Csvg width='12' height='8' viewBox='0 0 12 8' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1.5L6 6.5L11 1.5' stroke='%236B7C89' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")`,
                  backgroundRepeat: "no-repeat",
                  backgroundPosition: "right 16px center",
                }}
              >
                <option value="pastor">Pastor / Pastora</option>
                <option value="admin">Administrador</option>
                <option value="lider">Líder de célula</option>
                <option value="membro">Membro</option>
              </select>
            </div>
          </>
        )}

        <button
          type="submit"
          className="mt-4 w-full h-12 rounded-xl bg-primary hover:bg-primary-hover text-primary-foreground font-bold text-[15px] transition-colors shadow-lg shadow-primary/20"
        >
          {step === 1 ? "Próximo →" : "Criar conta"}
        </button>

        {step === 2 && (
          <button
            type="button"
            onClick={() => setStep(1)}
            className="w-full h-12 rounded-xl border border-border text-foreground-subtle hover:text-foreground hover:bg-border/30 font-semibold text-[15px] transition-colors"
          >
            ← Voltar
          </button>
        )}

        {step === 1 && (
          <button
            type="button"
            onClick={onBack}
            className="text-sm font-semibold text-foreground-muted hover:text-primary transition-colors"
          >
            Já tenho uma conta
          </button>
        )}
      </div>
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
  onChange: (value: string) => void;
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
        onChange={(event) => onChange(event.target.value)}
        autoComplete={autoComplete}
        className="w-full h-12 rounded-xl border border-border bg-background text-foreground px-4 text-[15px] outline-none focus:border-primary focus:ring-1 focus:ring-primary/50 transition-all placeholder:text-border"
      />
    </div>
  );
}
