"use client";
import { useEffect,useRef,useState,type FormEvent } from 'react';
import Link from './StableLink';
import { AccessShell, CpfField, postAccess } from './AccessPortal';

export default function Log1Form() {
  const [busy,setBusy]=useState(false);const [message,setMessage]=useState('');const [done,setDone]=useState(false);
  const sending=useRef(false);const feedback=useRef<HTMLParagraphElement>(null);const success=useRef<HTMLDivElement>(null);
  useEffect(()=>{if(message)(done?success.current:feedback.current)?.focus();},[message,done,busy]);
  async function submit(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();if(sending.current)return;sending.current=true;setBusy(true);setMessage('');
    try {const data=Object.fromEntries(new FormData(event.currentTarget));const result=await postAccess('/api/public/log1',{...data,aceite:data.aceite==='on'});setMessage(result.message||'Solicitação recebida.');setDone(true);}catch(error){setMessage((error as Error).message);}finally{sending.current=false;setBusy(false);}
  }
  return <AccessShell><Link className="access-back" href="/login">← Voltar ao acesso</Link><header className="access-heading"><span className="access-eyebrow">LOG1 · NOVA COMUNIDADE</span><h1>{done?'O primeiro passo está dado.':'Vamos conhecer você.'}</h1><p>{done?'Nossa equipe analisará sua solicitação.':'Conte quem vai representar sua comunidade. Após a análise, você receberá um link individual para conhecer e contratar um plano.'}</p></header>
    {done?<div className="access-success" role="status" ref={success} tabIndex={-1}><span aria-hidden="true">✓</span><p>{message}</p><Link href="/login">Voltar para o login →</Link></div>:<><ol className="access-steps" aria-label="Etapas da criação"><li aria-current="step"><b>1</b> Solicitação</li><li><b>2</b> Plano</li><li><b>3</b> Aprovação</li></ol><form className="access-form" method="post" action="/api/public/log1" onSubmit={submit} aria-busy={busy}><fieldset className="commercial-form-fields" disabled={busy} aria-label="Dados da solicitação"><label>Nome completo<input name="nome" required minLength={5} maxLength={120} autoComplete="name" placeholder="Seu nome completo"/></label><label>Telefone com DDD<input name="telefone" required type="tel" autoComplete="tel" maxLength={20} placeholder="(11) 99999-9999"/></label><label>Data de nascimento<input name="nascimento" required type="date" autoComplete="bday" min="1900-01-01" max={new Date().toISOString().slice(0,10)}/></label><CpfField autoComplete="off" hint="Usado para identificar o responsável pela solicitação."/><label className="access-check"><input name="aceite" type="checkbox" required/><span>Concordo com o uso dos meus dados para analisar esta solicitação, conforme a <Link href="/privacidade" target="_blank" rel="noopener">Política de Privacidade</Link> (abre em nova aba).</span></label><p className="access-info">A solicitação não cria uma conta nem libera acesso à plataforma. A ativação depende de contratação e aprovação.</p></fieldset>{message&&<p className="access-feedback" role="alert" ref={feedback} tabIndex={-1}>{message}</p>}<button className="access-primary" disabled={busy}>{busy?'Enviando…':'Enviar solicitação'}<span>→</span></button></form></>}
  </AccessShell>;
}
