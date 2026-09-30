"use client";
import SafeImage from "./SafeImage";


import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import VinkuloLoading from './VinkuloLoading';
import Link from './StableLink';
import { useThemePreference } from '../lib/use-theme-preference';

export function AccessShell({children,owner=false,logoUrl='',siteName='Vínkulo'}:{children:ReactNode;owner?:boolean;logoUrl?:string;siteName?:string}) {
  const {theme,updateTheme}=useThemePreference();
  return <main className="access-shell" data-owner={owner}>
    <aside className="access-story">
      <Link href="/" className="access-brand"><SafeImage src={logoUrl||'/vinkulo-app-icon-192.png'} alt="" width={42} height={42}/><span>{siteName.toLowerCase()}<small>{owner?'ADMINISTRAÇÃO DA PLATAFORMA':'PESSOAS. FÉ. COMUNIDADE.'}</small></span></Link>
      <div className="access-story-copy"><span className="access-eyebrow">{owner?'ACESSO DO PROPRIETÁRIO':'PERTENCER NOS CONECTA'}</span><h2>{owner?<>Uma visão completa.<br/><em>Cuidado em cada decisão.</em></>:<>Mais perto das pessoas.<br/><em>Mais presente na comunidade.</em></>}</h2><p>{owner?'Solicitações, comunidades e planos em um único lugar. Cada operação respeita as permissões da sua conta.':'Um espaço para acompanhar sua comunidade, participar e cuidar do que importa.'}</p>
      <div className="access-orbits" aria-hidden="true"><i/><i/><i/><span>v</span><b className="orbit-one">Comunidade</b><b className="orbit-two">Participação</b><b className="orbit-three">Cuidado</b></div></div>
      <small className="access-story-foot">{owner?'Administração com acesso individual e auditável.':'Sua comunidade, conectada.'}</small>
    </aside>
    <section className="access-content"><nav className="access-toolbar" aria-label="Preferências de exibição"><Link href="/">Conheça o Vínkulo ↗</Link><div className="access-theme">{(['CLARO','AUTO','ESCURO'] as const).map((value,i)=><button type="button" key={value} aria-label={`Tema ${['claro','automático','escuro'][i]}`} aria-pressed={theme===value} onClick={()=>updateTheme(value)}>{['☀','◐','☾'][i]}</button>)}</div></nav><div className="access-form-area">{children}</div><footer className="access-footer"><Link href="/termos">Termos de Uso</Link><span>·</span><Link href="/privacidade">Privacidade</Link><small>© {new Date().getFullYear()} {siteName}</small></footer></section>
  </main>;
}

export async function postAccess(url:string,body:Record<string,unknown>) {
  const response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),credentials:'same-origin',signal:AbortSignal.timeout(20000)}).catch(error=>{throw new Error(error.name==='TimeoutError'?'A conexão demorou. Tente novamente.':'Não foi possível conectar. Verifique sua internet e tente novamente.');});
  const result=await response.json().catch(()=>({error:'Não foi possível conectar. Tente novamente.'}));
  if(!response.ok) throw new Error(result.error||'Não foi possível concluir.');
  return result as {ok?:boolean;message?:string;redirect?:string};
}
export function CpfField({autoComplete='username',hint}:{autoComplete?:string;hint?:string}) {
  return <label>CPF<input name="cpf" inputMode="numeric" autoComplete={autoComplete} required minLength={11} maxLength={14} placeholder="000.000.000-00" aria-describedby="cpf-help"/><small id="cpf-help">{hint||(autoComplete==='username'?'Use o CPF vinculado à sua conta.':'Seu CPF será o identificador do seu acesso.')}</small></label>;
}
export function PasswordField({fresh=false}:{fresh?:boolean}) {
  const [visible,setVisible]=useState(false);
  return <label>Senha<span className="access-password"><input name="senha" type={visible?'text':'password'} autoComplete={fresh?'new-password':'current-password'} required minLength={8} maxLength={256} placeholder={fresh?'Crie uma senha segura':'Digite sua senha'}/><button type="button" aria-label={visible?'Ocultar senha':'Mostrar senha'} aria-pressed={visible} onClick={()=>setVisible(!visible)}>{visible?'Ocultar':'Mostrar'}</button></span>{fresh&&<small>Pelo menos 8 caracteres, com letras e números.</small>}</label>;
}
export default function AccessPortal({owner=false,returnTo='',initialMessage='',logoUrl='',siteName='Vínkulo'}:{owner?:boolean;returnTo?:string;initialMessage?:string;logoUrl?:string;siteName?:string}) {
  const [recovery,setRecovery]=useState(false);const [busy,setBusy]=useState(false);const [message,setMessage]=useState(initialMessage);
  useEffect(()=>{const reset=()=>setBusy(false);window.addEventListener('pageshow',reset);return()=>window.removeEventListener('pageshow',reset);},[]);
  async function submit(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();setBusy(true);setMessage('');
    try {const result=await postAccess(recovery?'/api/auth/esqueci-senha':owner?'/api/auth/proprietario':'/api/auth/login',{...Object.fromEntries(new FormData(event.currentTarget)),returnTo});
      if(result.redirect) {window.location.assign(result.redirect);return;}else setMessage(result.message||'Solicitação enviada.');
    }catch(error){setMessage((error as Error).message);}setBusy(false);
  }
  return <AccessShell owner={owner} logoUrl={logoUrl} siteName={siteName}><header className="access-heading"><span className="access-eyebrow">{recovery?'RECUPERAÇÃO DE ACESSO':owner?'ÁREA RESTRITA':'BEM-VINDO AO VÍNKULO'}</span><h1>{recovery?'Vamos recuperar seu acesso.':owner?'Acesso do Proprietário.':'Sua comunidade está aqui.'}</h1><p>{recovery?'Informe seu CPF. A liderança responsável receberá a solicitação para ajudar na recuperação.':owner?'Entre com as credenciais da sua conta administrativa.':'Entre com seu CPF e senha para continuar.'}</p></header>
    <form className="access-form" method="post" action={recovery?'/api/auth/esqueci-senha':owner?'/api/auth/proprietario':'/api/auth/login'} onSubmit={submit}><input type="hidden" name="returnTo" value={returnTo}/><CpfField/>{!recovery&&<><PasswordField/><button type="button" className="access-text-button access-recover" onClick={()=>{setRecovery(true);setMessage('');}}>Esqueci minha senha</button></>}{message&&<p className="access-feedback" role="alert">{message}</p>}<button className="access-primary" disabled={busy}>{busy?'Aguarde…':recovery?'Solicitar recuperação':owner?'Entrar na administração':'Entrar'}<span aria-hidden="true">→</span></button></form>
    {recovery?<button className="access-text-button" onClick={()=>{setRecovery(false);setMessage('');}}>← Voltar para entrar</button>:<p className="access-migration">Já tinha uma conta? <Link href="/vincular-cpf">Vincule seu CPF</Link></p>}
    {!owner&&!recovery&&<div className="access-paths"><Link className="access-community-link" href="/log1"><span><strong>Quero criar uma comunidade</strong><small>Conheça os planos e solicite seu acesso</small></span><b aria-hidden="true">↗</b></Link><p><strong>Recebeu um convite?</strong> Abra o link enviado pela sua comunidade para criar sua conta.</p></div>}
    {owner&&<p className="access-private-note">Acesso exclusivo para contas autorizadas. Sua sessão administrativa expira em uma hora.</p>}
    {busy&&!recovery&&typeof document!=='undefined'&&createPortal(<VinkuloLoading label="Entrando na sua comunidade…"/>,document.body)}
  </AccessShell>;
}
