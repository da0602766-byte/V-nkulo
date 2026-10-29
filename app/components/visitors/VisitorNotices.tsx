"use client";
import {useEffect,useMemo,useState} from 'react';
import {Dialog} from './Dialog';
import {Icon,I,input} from './Views';
import {api,today,type Pessoa,type Categoria} from './data';
import {buildVisitorNotices,noticeGroups,relevantVisitorNotes,type VisitorCareNote} from '../../lib/visitor-notices';
export default function VisitorNotices({people,categories,canViewFollowups,canViewNotes,onOpen,onNote}:{people:Pessoa[];categories:Categoria[];canViewFollowups:boolean;canViewNotes:boolean;onOpen:(id:string)=>void;onNote:(id:string)=>void}){
  const [open,setOpen]=useState(false),[group,setGroup]=useState('todos'),[query,setQuery]=useState('');
  const [retry,setRetry]=useState(0);
  const queryKey=useMemo(()=>({people,canViewNotes,retry,open}),[people,canViewNotes,retry,open]);
  const [result,setResult]=useState<{key:object;notes:VisitorCareNote[];error:string}|null>(null);
  const current=result?.key===queryKey?result:null;
  const notes=current?.notes||[],notesError=current?.error||'',loading=canViewNotes&&!current;
  const date=today();
  const notices=useMemo(()=>buildVisitorNotices(people,categories,date,canViewFollowups),[people,categories,date,canViewFollowups]);
  useEffect(()=>{
    let current=true;
    if(!canViewNotes)return;
    api<{anotacoes:VisitorCareNote[]}>('/api/pilot/anotacoes').then(v=>{if(current)setResult({key:queryKey,notes:v.anotacoes,error:''});}).catch(()=>{if(current)setResult({key:queryKey,notes:[],error:'Não foi possível conferir os lembretes das anotações.'});});
    return()=>{current=false;};
  },[canViewNotes,queryKey]);
  const relevantNotes=canViewNotes?relevantVisitorNotes(notes,people,date):[];
  const count=notices.length+relevantNotes.length;
  const visible=notices.filter(n=>(group==='todos'||n.reasons.some(r=>r.group===group))&&`${n.person.nome} ${n.person.categoria||''} ${n.reasons.map(r=>r.text).join(' ')}`.toLocaleLowerCase('pt-BR').includes(query.toLocaleLowerCase('pt-BR')));
  const filteredNotes=relevantNotes.filter(n=>`${n.titulo} ${n.visitanteNome}`.toLocaleLowerCase('pt-BR').includes(query.toLocaleLowerCase('pt-BR')));
  return <>
    <button className="vp-tool vp-notices-trigger" aria-label={`Avisos de Visitantes: ${count} itens${notesError?', lembretes indisponíveis':''}`} title="Cuidados e atenção de Visitantes" aria-haspopup="dialog" aria-expanded={open} onClick={()=>setOpen(true)}><Icon d={I.bell}/>{count>0&&<b>{count>99?'99+':count}</b>}{notesError&&<i/>}</button>
    {open&&<Dialog title="Avisos de Visitantes" onClose={()=>setOpen(false)} wide>
      <div className="vp-notices">
        <p>Cuidados e atenção desta área, em ordem de prioridade. {notices.length} pessoa(s) com avisos e {relevantNotes.length} anotação(ões) pendente(s). As pendências saem daqui quando a ficha é atualizada.</p>
        <input className={input} aria-label="Buscar avisos de Visitantes" placeholder="Buscar pessoa, categoria ou aviso" value={query} onChange={e=>setQuery(e.target.value)}/>
        <div className="vp-notice-filters" aria-label="Filtrar avisos">{[{id:'todos',label:'Todos'},...noticeGroups,{id:'notas',label:'Anotações'}].map(g=><button key={g.id} aria-pressed={group===g.id} onClick={()=>setGroup(g.id)}>{g.label}<span>{g.id==='todos'?count:g.id==='notas'?relevantNotes.length:notices.filter(n=>n.reasons.some(r=>r.group===g.id)).length}</span></button>)}</div>
        {!canViewFollowups&&<p className="vp-muted">O histórico e os retornos de contato exigem permissão de consulta de acompanhamentos.</p>}
        {loading&&<p role="status">Conferindo anotações…</p>}
        {notesError&&<p role="alert">{notesError} <button onClick={()=>setRetry(v=>v+1)}>Tentar novamente</button></p>}
        {group!=='notas'&&visible.map(n=><article key={n.person.id} className="vp-notice-row" data-tone={n.reasons[0].group}>
          <div><strong>{n.person.nome}</strong><small>{n.person.categoria||'Sem categoria'}</small><ul>{n.reasons.filter(r=>group==='todos'||r.group===group).map(r=><li key={r.text} data-tone={r.group}>{r.text}</li>)}</ul>{n.person.proximaAcao&&<p>Próxima ação: {n.person.proximaAcao}</p>}</div>
          <button onClick={()=>{setOpen(false);onOpen(n.person.id);}}>Ver ficha <span className="sr-only">de {n.person.nome}</span></button>
        </article>)}
        {(group==='todos'||group==='notas')&&filteredNotes.map(n=><article className="vp-notice-row" key={`note-${n.id}`}><div><strong>{n.titulo}</strong><small>{n.visitanteNome}</small><p>{n.checklist.filter(i=>!i.concluido).length} tarefa(s) pendente(s){n.lembreteEm?` · Lembrete: ${new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Sao_Paulo',dateStyle:'short',timeStyle:'short'}).format(new Date(n.lembreteEm))}`:''}</p></div><button onClick={()=>{setOpen(false);onNote(n.id);}}>Ver anotação</button></article>)}
        {(group==='notas'?filteredNotes.length===0:visible.length===0&&(group!=='todos'||filteredNotes.length===0))&&<p className="vp-empty">Nenhum aviso encontrado neste filtro.</p>}
        <small>Integração reúne informações a confirmar; ausência de vínculo não indica, por si só, um problema. Os totais dos filtros podem se sobrepor porque uma pessoa pode ter vários avisos.</small>
      </div>
    </Dialog>}
  </>;
}
