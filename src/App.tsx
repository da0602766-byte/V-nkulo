import { useState, useEffect } from "react";
import ReceptionPage from "./pages/ReceptionPage";
import LandingPage from "./pages/LandingPage";
import WelcomePage from "./pages/WelcomePage";

type View = "reception" | "landing" | "welcome";

export default function App() {
  const [view, setView] = useState<View>("reception");
  const [userEmail, setUserEmail] = useState("");
  const [isDark, setIsDark] = useState(() => {
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  });

  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }, [isDark]);

  const toggleTheme = () => setIsDark(!isDark);

  const handleLoginSuccess = (email: string) => {
    setUserEmail(email);
    setView("welcome");
  };

  return (
    <div className="h-full relative overflow-hidden bg-background">
      {/* Papel de parede sutil no modo claro */}
      <div 
        className="absolute inset-0 z-0 pointer-events-none transition-opacity duration-700 opacity-100 dark:opacity-0"
        style={{
          backgroundImage: 'url("https://images.unsplash.com/photo-1558591710-4b4a1ae0f04d?auto=format&fit=crop&q=80&w=2000")',
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundAttachment: 'fixed',
        }}
      >
        <div className="absolute inset-0 bg-background/80 backdrop-blur-[2px]" />
      </div>

      {/* Papel de parede ou textura sutil no modo escuro (opcional) */}
      <div 
        className="absolute inset-0 z-0 pointer-events-none transition-opacity duration-700 opacity-0 dark:opacity-100"
        style={{
          backgroundImage: 'radial-gradient(ellipse 80% 60% at 50% 0%, rgba(37,99,235,0.08) 0%, transparent 70%)',
        }}
      />

      <div className="relative z-10 h-full overflow-y-auto">
        {/* Botão de Tema Global */}
        <button 
          type="button"
          onClick={toggleTheme}
          className="fixed bottom-5 right-5 md:bottom-6 md:right-6 z-[100] w-12 h-12 rounded-full bg-surface/90 backdrop-blur-md border border-border shadow-xl flex items-center justify-center text-foreground hover:bg-surface-subtle hover:border-primary/40 transition-all hover:scale-105 duration-200"
          aria-label={isDark ? "Ativar tema claro" : "Ativar tema escuro"}
          aria-pressed={isDark}
        >
          {isDark ? <SunIcon /> : <MoonIcon />}
        </button>

        {view === "reception" ? (
          <ReceptionPage 
            onGoToLanding={() => setView("landing")} 
            onLoginSuccess={handleLoginSuccess}
          />
        ) : view === "landing" ? (
          <LandingPage onGoToReception={() => setView("reception")} />
        ) : (
          <WelcomePage email={userEmail} />
        )}
      </div>
    </div>
  );
}

function SunIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden>
      <circle cx="12" cy="12" r="3.75" />
      <path d="M12 2.5v2M12 19.5v2M4.5 4.5l1.4 1.4M18.1 18.1l1.4 1.4M2.5 12h2M19.5 12h2M4.5 19.5l1.4-1.4M18.1 5.9l1.4-1.4" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M20.2 15.2A8.2 8.2 0 0 1 8.8 3.8 8.3 8.3 0 1 0 20.2 15.2Z" />
    </svg>
  );
}
