"use client";
import "./parking-history.css";
import { useEffect,useState } from "react";
import { ParkingEmpty, ParkingMovementCard } from "./ParkingUi";
import type { Movement } from "./types";

export default function ParkingMovementHistory() {
  const [q,setQ]=useState(''),[page,setPage]=useState(1),[status,setStatus]=useState('');
  const [result,setResult]=useState<{key:string;movimentacoes:Movement[];total:number}|null>(null);
  const [failure,setFailure]=useState<{key:string;message:string}|null>(null),[revision,setRevision]=useState(0);
  const queryKey=JSON.stringify([q,page,status,revision]);
  const current=result?.key===queryKey?result:null;
  const error=failure?.key===queryKey?failure.message:'';
  const loading=!current&&!error;
  useEffect(()=>{
    const controller=new AbortController();
    const timer=setTimeout(async()=>{
      try {
        const response=await fetch('/api/pilot/estacionamento/movimentacoes?'+new URLSearchParams({q,page:String(page),status}),{cache:'no-store',signal:controller.signal});
        const data=await response.json();
        if(!response.ok) throw new Error(data.error || 'Não foi possível carregar o histórico.');
        if(!Array.isArray(data.movimentacoes)||!Number.isFinite(data.total)) throw new Error('Não foi possível ler o histórico. Tente novamente.');
        if(controller.signal.aborted) return;
        const lastPage=Math.max(1,Math.ceil(data.total/40));
        if(page>lastPage){setPage(lastPage);return;}
        setResult({...data,key:queryKey});setFailure(null);
      } catch(cause) {if(!controller.signal.aborted) setFailure({key:queryKey,message:(cause as Error).message});}
    },200);
    return()=>{clearTimeout(timer);controller.abort();};
  },[q,page,status,revision,queryKey]);
  return <section className="parking-history-workspace" aria-label="Histórico de movimentações" aria-busy={loading}>
    <div className="parking-v2-filters"><label>Buscar placa, vaga ou pessoa<input type="search" value={q} onChange={event=>{setQ(event.target.value);setPage(1);}} placeholder="Placa, código da vaga ou nome" /></label><label>Situação<select value={status} onChange={event=>{setStatus(event.target.value);setPage(1);}}><option value="">Todas</option><option value="NO_LOCAL">No local</option><option value="ENCERRADA">Encerrada</option></select></label><button type="button" disabled={loading} onClick={()=>setRevision(r=>r+1)}>Atualizar histórico</button>{(q||status)&&<button type="button" onClick={()=>{setQ('');setStatus('');setPage(1);}}>Limpar filtros</button>}</div>
    {error && <div className="parking-history-error"><p role="alert">{error}</p><button type="button" onClick={()=>setRevision(r=>r+1)}>Tentar novamente</button></div>}{loading && <p role="status">Atualizando histórico…</p>}
    {current && <>
      <div className="parking-movement-grid">{current.movimentacoes.map(item=><ParkingMovementCard key={item.id} movement={item}/>)}</div>
      {current.total===0 && <ParkingEmpty icon="search" title={q||status?"Nenhuma movimentação para estes filtros":"Nenhuma movimentação registrada"}>{q||status?"Ajuste a busca ou use Limpar filtros para ampliar a consulta.":"As entradas e saídas registradas aparecerão aqui."}</ParkingEmpty>}
      <footer className="parking-v2-pagination"><span role="status">{current.total} movimentações · página {page} de {Math.max(1,Math.ceil(current.total/40))}</span><div><button type="button" disabled={page===1} onClick={()=>setPage(p=>p-1)}>Anterior</button><button type="button" disabled={page*40>=current.total} onClick={()=>setPage(p=>p+1)}>Próxima</button></div></footer>
    </>}
  </section>;
}
