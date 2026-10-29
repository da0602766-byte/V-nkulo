"use client";

import TransientFeedback from "./TransientFeedback";
import {useEffect, useState, type FormEvent} from 'react';
import type {CommunityStory} from '../lib/community-story';

export default function CommunityStoryEditor() {
  const [story,setStory]=useState<CommunityStory>({title:'',body:'',mission:'',foundedYear:'',published:false});
  const [eligible,setEligible]=useState(false);
  const [loaded,setLoaded]=useState(false);
  const [saving,setSaving]=useState(false);
  const [message,setMessage]=useState('');
  useEffect(()=>{let active=true;fetch('/api/pilot/community-story',{cache:'no-store'}).then(async r=>{const data=await r.json();if(!r.ok)throw new Error(data.error||'Não foi possível carregar a história.');if(active){setStory(data.story);setEligible(data.eligible);setLoaded(true);}}).catch(error=>{if(active)setMessage(error.message);});return()=>{active=false;};},[]);
  async function save(event:FormEvent<HTMLFormElement>){event.preventDefault();setSaving(true);setMessage('');try{const response=await fetch('/api/pilot/community-story',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(story)});const data=await response.json();if(!response.ok)throw new Error(data.error||'Não foi possível salvar.');setStory(data.story);setMessage(data.story.published?'História publicada na página da comunidade.':'Rascunho salvo. A história permanece privada.');}catch(error){setMessage((error as Error).message);}finally{setSaving(false);}}
  return <section className="community-story-editor">
    <header><div><p className="pilot-kicker">PÁGINA PÚBLICA · PLANO PAGO</p><h2>A história que nos une</h2><p>Conte como a comunidade começou, os momentos importantes e o propósito que continua vivo.</p></div></header>
    {message&&<TransientFeedback role="status" className="operations-feedback">{message}</TransientFeedback>}
    {!loaded&&!message&&<p>Carregando história…</p>}
    {loaded&&!eligible&&<p className="community-story-locked">Disponível para comunidades com assinatura de plano pago ativa. A apresentação básica da comunidade continua disponível.</p>}
    {loaded&&eligible&&<form onSubmit={save}>
      <div className="community-story-fields"><label>Título da história<input value={story.title} maxLength={120} onChange={e=>setStory({...story,title:e.target.value})} placeholder="Como tudo começou"/></label><label>Ano de fundação<input inputMode="numeric" pattern="[0-9]{4}" maxLength={4} value={story.foundedYear} onChange={e=>setStory({...story,foundedYear:e.target.value})} placeholder="Ex.: 1998"/></label></div>
      <label>Nossa história<textarea rows={9} maxLength={8000} value={story.body} onChange={e=>setStory({...story,body:e.target.value})} placeholder="Compartilhe suas origens, encontros e momentos que marcaram a comunidade."/></label>
      <label>Nosso propósito<textarea rows={3} maxLength={600} value={story.mission} onChange={e=>setStory({...story,mission:e.target.value})} placeholder="O que move sua comunidade hoje?"/></label>
      <label className="community-story-publish"><input type="checkbox" checked={story.published} onChange={e=>setStory({...story,published:e.target.checked})}/>Exibir esta história na página pública</label>
      <button type="submit" disabled={saving}>{saving?'Salvando…':'Salvar história'}</button>
    </form>}
  </section>;
}
