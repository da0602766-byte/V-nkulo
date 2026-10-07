"use client";
import { useEffect,useState } from "react";
import { ParkingEmpty, ParkingMovementCard } from "./ParkingUi";
import type { Movement } from "./types";

export default function ParkingMovementHistory() {
  const [q,setQ]=useState(''),[page,setPage]=useState(1),[status,setStatus]=useState('');
  const [result,setResult]=useState<{movimentacoes:Movement[];total:number}|null>(null);
  const [error,setError]=useState(''),[loading,setLoading]=useState(true),[revision,setRevision]=useState(0);
  useEffect(()=>{
    const controller=new AbortController();
    const timer=setTimeout(async()=>{
      setLoading(true);setError('');
      try {
        const response=await fetch('/api/pilot/estacionamento/movimentacoes?'+new URLSearchParams({q,page:String(page),status}),{cache:'no-store',signal:controller.signal});
        const data=await response.json();
        if(!response.ok) throw new Error(data.error || 'Não foi possível carregar o histórico.');
        if(!controller.signal.aborted) setResult(data);
      } catch(cause) {if(!controller.signal.aborted) {setResult(null);setError((cause as Error).message);}}
      finally {if(!controller.signal.aborted) setLoading(false);}
    },200);
    return()=>{clearTimeout(timer);controller.abort();};
  },[q,page,status,revision]);
  return <section className="parking-history-workspace" aria-label="Histórico de movimentações">
    <div className="parking-v2-filters"><label>Buscar placa, vaga ou pessoa<input value={q} onChange={event=>{setQ(event.target.value);setPage(1);}} /></label><label>Situação<select value={status} onChange={event=>{setStatus(event.target.value);setPage(1);}}><option value="">Todas</option><option value="NO_LOCAL">No local</option><option value="ENCERRADA">Encerrada</option></select></label><button type="button" onClick={()=>setRevision(r=>r+1)}>Atualizar</button></div>
    {error && <p role="alert">{error}</p>}{loading && <p role="status">Atualizando histórico…</p>}
    <div className="parking-movement-grid">{result?.movimentacoes.map(item=><ParkingMovementCard key={item.id} movement={item}/>)}</div>
    {result?.total===0 && <ParkingEmpty icon="search" title="Nenhuma movimentação encontrada.">Revise os filtros ou registre uma entrada para iniciar o histórico.</ParkingEmpty>}
    <footer className="parking-v2-pagination"><span>{result?.total ?? '—'} movimentações · página {page}</span><div><button type="button" disabled={loading||page===1} onClick={()=>setPage(p=>p-1)}>Anterior</button><button type="button" disabled={loading||page*40>=(result?.total||0)} onClick={()=>setPage(p=>p+1)}>Próxima</button></div></footer>
  </section>;
}
