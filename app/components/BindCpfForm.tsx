"use client";
import { useState,type FormEvent } from 'react';
import Link from './StableLink';
import { AccessShell, CpfField, PasswordField, postAccess } from './AccessPortal';
export default function BindCpfForm(){
  const [busy,setBusy]=useState(false);const [message,setMessage]=useState('');const [done,setDone]=useState(false);
  async function submit(event:FormEvent<HTMLFormElement>){event.preventDefault();setBusy(true);setMessage('');try{const result=await postAccess('/api/auth/vincular-cpf',Object.fromEntries(new FormData(event.currentTarget)));setMessage(result.message||'CPF vinculado.');setDone(true);}catch(error){setMessage((error as Error).message);}finally{setBusy(false);}}
  return <AccessShell><Link className="access-back" href="/login">← Voltar ao acesso</Link><header className="access-heading"><span className="access-eyebrow">PARA QUEM JÁ TEM CONTA</span><h1>Seu acesso, agora pelo CPF.</h1><p>Confirme o e-mail e a senha que você já usava. Suas comunidades, permissões e dados serão preservados.</p></header>{done?<div className="access-success" role="status"><p>{message}</p><Link href="/login">Entrar com CPF →</Link></div>:<form className="access-form" method="post" action="/api/auth/vincular-cpf" onSubmit={submit}><label>E-mail da conta<input name="email" required type="email" autoComplete="email"/></label><PasswordField/><CpfField autoComplete="off"/>{message&&<p className="access-feedback" role="alert">{message}</p>}<button className="access-primary" disabled={busy}>{busy?'Verificando…':'Vincular CPF'}</button><p className="access-info">Se você usava apenas o Google ou esqueceu a senha, solicite a recuperação à liderança da sua comunidade antes de vincular.</p></form>}</AccessShell>;
}
