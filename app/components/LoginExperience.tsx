"use client";
import type { ReactNode } from "react";
import Link from "./StableLink";
import VinkuloMark from "./VinkuloMark";
import { useThemePreference } from "../lib/use-theme-preference";
import "./login-experience.css";

export default function LoginExperience({children,siteName="Vínkulo"}:{children:ReactNode;siteName?:string}) {
  const {theme,updateTheme}=useThemePreference();
  return <main className="vk-login">
    <header className="vk-login-top"><Link href="/" className="vk-login-brand" aria-label={`${siteName} — início`}><VinkuloMark size={36}/><strong>{siteName}</strong></Link>
      <div className="vk-login-tools"><button className="vk-login-help" type="button" onClick={()=>window.dispatchEvent(new Event("vinkulo:open-help"))}>Ajuda ↗</button><nav className="vk-login-theme" aria-label="Preferências de exibição">{(["CLARO","AUTO","ESCURO"] as const).map((value,index)=><button type="button" key={value} title={`Tema ${["claro","automático","escuro"][index]}`} aria-label={`Tema ${["claro","automático","escuro"][index]}`} aria-pressed={theme===value} onClick={()=>updateTheme(value)}>{["☀","◐","☾"][index]}</button>)}</nav></div>
    </header>
    <section className="vk-login-center" aria-label="Acesse sua conta"><div className="vk-login-form-wrap">{children}</div></section>
    <footer className="vk-login-footer"><span>Conecta. Edifica. Transforma.</span><div><Link href="/termos">Termos de uso</Link><Link href="/privacidade">Privacidade</Link></div><small>© {new Date().getFullYear()} {siteName}</small></footer>
  </main>;
}
