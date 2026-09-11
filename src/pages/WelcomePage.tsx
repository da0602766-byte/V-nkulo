import { useEffect } from "react";

interface Props {
  email: string;
}

export default function WelcomePage({ email }: Props) {
  useEffect(() => {
    // Apenas simula um tempo de carregamento no ambiente de teste
    const timer = setTimeout(() => {
      console.log("Navegar para o dashboard...");
    }, 3000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="min-h-full flex flex-col items-center justify-center text-foreground font-sans px-6 relative overflow-hidden">
      {/* Background fio sutil */}
      <div className="absolute inset-0 pointer-events-none" aria-hidden>
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_100%_60%_at_50%_0%,rgba(37,99,235,0.08)_0%,transparent_70%)]" />
      </div>

      <div className="relative z-10 animate-slide-up text-center flex flex-col items-center">
        <div className="w-20 h-20 bg-primary rounded-full flex items-center justify-center mb-8 shadow-xl shadow-primary/20 animate-pulse-glow">
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
        </div>
        
        <h1 className="font-display font-extrabold text-3xl md:text-4xl tracking-tight mb-3">
          Tudo pronto!
        </h1>
        
        <p className="text-foreground-subtle text-lg mb-8 max-w-sm">
          Preparando o ambiente e conectando <strong className="text-foreground font-bold">{email}</strong> à comunidade...
        </p>
        
        <div className="flex justify-center gap-2">
          <div className="w-2.5 h-2.5 bg-primary rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
          <div className="w-2.5 h-2.5 bg-yellow rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
          <div className="w-2.5 h-2.5 bg-accent rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
        </div>
      </div>
    </div>
  );
}
