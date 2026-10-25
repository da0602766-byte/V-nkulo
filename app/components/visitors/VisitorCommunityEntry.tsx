"use client";
import {useRef,useState} from 'react';
import './visitors-page.css';

export default function VisitorCommunityEntry({communityId,communityName}:{communityId:number;communityName:string}){
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  const working=useRef(false);
  async function open(){
    if(working.current)return;working.current=true;setBusy(true);setError('');
    try{
      const response=await fetch('/api/pilot/comunidade-ativa',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({comunidadeId:communityId}),signal:AbortSignal.timeout(20000)});
      if(!response.ok){const body=await response.json();throw new Error(body.error||'Não foi possível abrir esta comunidade.');}
      location.assign(`/painel/visitantes?section=compartilhar&comunidade=${communityId}`);
    }catch(e){setError(e instanceof Error&&e.name==='Error'?e.message:'Não foi possível abrir os contatos. Tente novamente.');working.current=false;setBusy(false);}
  }
  return <main className="pilot-state-page vp-community-entry"><p className="pilot-kicker">LISTA COMPARTILHADA</p><h1>Visitantes de {communityName}</h1><p>Este aviso pertence a outra comunidade. Abra para consultar seu acesso e os contatos.</p>{error&&<p role="alert">{error}</p>}<button disabled={busy} onClick={()=>void open()}>{busy?'Abrindo…':'Abrir esta comunidade'}</button><a href="/painel">Voltar ao painel</a></main>;
}
