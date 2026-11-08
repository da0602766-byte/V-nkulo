"use client";
import {useCallback,useEffect,useId,useMemo,useRef,useState,type CSSProperties,type FormEvent,type ReactNode} from 'react';
import {readAgendaJson,AgendaRequestError,agendaErrorMessage} from '../lib/agenda-request';
import {calendarDay,calendarLocalInput,calendarEnd,calendarConflicts,calendarNormalize,TASK_STATUSES,SOURCE_LABELS,type CalendarItem,type CalendarTaskStatus} from '../lib/calendar-management';
import './management-calendar.css';

type Mode='mes'|'semana'|'dia'|'agenda';
type Owner={id:number;nome:string};
type Draft={kind:'TAREFA'|'PESSOAL';titulo:string;descricao:string;iniciaEm:string;terminaEm:string;prazoEm:string;prioridade:string;status:string;responsavelId:string;visibilidade:string;motivoBloqueio:string;local:string};
const days=['dom','seg','ter','qua','qui','sex','sáb'];
const formatDay=(date:Date)=>date.toLocaleDateString('pt-BR',{weekday:'long',day:'numeric',month:'long'});
const time=(value:string)=>new Date(value).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
const dayStart=(date:Date)=>new Date(date.getFullYear(),date.getMonth(),date.getDate());
const nextDay=(date:Date,delta=1)=>new Date(date.getFullYear(),date.getMonth(),date.getDate()+delta);
function period(date:Date,mode:Mode){
  if(mode==='dia')return [dayStart(date)];
  if(mode==='semana'){const first=nextDay(date,-date.getDay());return Array.from({length:7},(_,i)=>nextDay(first,i));}
  const first=new Date(date.getFullYear(),date.getMonth(),1);
  const start=mode==='mes'?nextDay(first,-first.getDay()):first;
  const total=mode==='mes'?Math.ceil((first.getDay()+new Date(date.getFullYear(),date.getMonth()+1,0).getDate())/7)*7:new Date(date.getFullYear(),date.getMonth()+1,0).getDate();
  return Array.from({length:total},(_,i)=>nextDay(start,i));
}
function toDraft(item:CalendarItem,userId:number):Draft{return {kind:item.camada==='PESSOAL'?'PESSOAL':'TAREFA',titulo:item.titulo,descricao:item.descricao,iniciaEm:calendarLocalInput(item.iniciaEm),terminaEm:calendarLocalInput(item.terminaEm),prazoEm:calendarLocalInput(item.prazoEm),prioridade:item.prioridade||'P2',status:item.camada==='PESSOAL'?(item.status==='CONCLUIDO'?'CONCLUIDO':'ABERTO'):item.status,responsavelId:String(item.responsavelId||userId),visibilidade:item.visibilidade||'PRIVADO',motivoBloqueio:item.motivoBloqueio||'',local:item.local};}
function blank(userId:number,start=''):Draft{return {kind:'TAREFA',titulo:'',descricao:'',iniciaEm:start,terminaEm:'',prazoEm:'',prioridade:'P2',status:'PLANEJADO',responsavelId:String(userId),visibilidade:'PRIVADO',motivoBloqueio:'',local:''};}
function statusText(item:CalendarItem){return item.camada==='TAREFA'?TASK_STATUSES[item.status as CalendarTaskStatus]:({'ABERTO':'Planejado','CONCLUIDO':'Concluído','PUBLICADO':'Publicado','RASCUNHO':'Rascunho','CANCELADO':'Cancelado','PENDENTE':'Pendente','CONFIRMADA':'Confirmada','INDISPONIVEL':'Indisponível','AUSENTE':'Ausente'}[item.status]||item.status);}
function overlapsDay(item:CalendarItem,date:Date){return !!item.iniciaEm&&Date.parse(item.iniciaEm)<nextDay(date).getTime()&&calendarEnd(item)>date.getTime();}
function payload(draft:Draft){return {...draft,responsavelId:Number(draft.responsavelId),iniciaEm:draft.iniciaEm?new Date(draft.iniciaEm).toISOString():null,terminaEm:draft.terminaEm?new Date(draft.terminaEm).toISOString():null,prazoEm:draft.prazoEm?new Date(draft.prazoEm).toISOString():null};}

export default function AgendaCalendar({podeVerEventos,podeAprovar,aoCriarEvento,atualizacao=0,headingContent,aoVerEvento}:{podeVerEventos:boolean;podeAprovar:boolean;aoCriarEvento?:(day?:string)=>void;atualizacao?:number;headingContent?:ReactNode;aoVerEvento?:(id?:number)=>void}){
  const [reference,setReference]=useState(()=>dayStart(new Date()));
  const [mode,setMode]=useState<Mode>('mes');
  const [items,setItems]=useState<CalendarItem[]>([]);
  const [owners,setOwners]=useState<Owner[]>([]);
  const [userId,setUserId]=useState(0);
  const [loading,setLoading]=useState(true),[loaded,setLoaded]=useState('');
  const [error,setError]=useState(''),[feedback,setFeedback]=useState('');
  const [limited,setLimited]=useState(false);
  const [search,setSearch]=useState(''),[owner,setOwner]=useState(''),[status,setStatus]=useState(''),[priority,setPriority]=useState(false),[source,setSource]=useState('');
  const [side,setSide]=useState(false),[selected,setSelected]=useState<CalendarItem|null>(null),[creating,setCreating]=useState(false);
  const [draft,setDraft]=useState<Draft>(()=>blank(0)),[busy,setBusy]=useState(false),[conflict,setConflict]=useState(false),[accept,setAccept]=useState(false);
  const [undo,setUndo]=useState<{item:CalendarItem;version:number}|null>(null);
  const [dragOver,setDragOver]=useState('');
  const [today,setToday]=useState(''),[zone,setZone]=useState(''),[now,setNow]=useState(0);
  const filtersId=useId(),summaryId=useId();
  const [filtersOpen,setFiltersOpen]=useState(false),[summaryOpen,setSummaryOpen]=useState(false),[helpOpen,setHelpOpen]=useState(false);
  const searchInput=useRef<HTMLInputElement>(null),filtersTrigger=useRef<HTMLButtonElement>(null),toolsMenu=useRef<HTMLDetailsElement>(null);
  const editor=useRef<HTMLHeadingElement>(null);
  const timeScroll=useRef<HTMLDivElement>(null);
  const requestRef=useRef<AbortController|null>(null);
  const dates=useMemo(()=>period(reference,mode),[reference,mode]);
  const from=dates[0].toISOString(),until=new Date(nextDay(dates.at(-1)!).getTime()-1).toISOString(),range=from+'/'+until;
  const fetchItems=useCallback(async()=>{
    requestRef.current?.abort();
    const request=new AbortController();requestRef.current=request;
    setLoading(true);setError('');
    try{
      const query='?de='+encodeURIComponent(from)+'&ate='+encodeURIComponent(until);
      const [agenda,tasks]=await Promise.all([
        readAgendaJson<{itens:CalendarItem[]}>('/api/pilot/agenda'+query,request.signal),
        readAgendaJson<{itens:CalendarItem[];responsaveis:Owner[];usuarioId:number;limitado:boolean}>('/api/pilot/agenda/tarefas'+query,request.signal)
      ]);
      if(request.signal.aborted)return;
      setItems([...agenda.itens,...tasks.itens]);setOwners(tasks.responsaveis);setUserId(tasks.usuarioId);setLimited(tasks.limitado);setLoaded(range);
    }catch(cause){
      if(request.signal.aborted)return;
      if(cause instanceof AgendaRequestError&&cause.status>=400&&cause.status<500){setItems([]);setLoaded('');setSelected(null);setCreating(false);setUndo(null);}
      setError(agendaErrorMessage(cause));
    }finally{if(!request.signal.aborted)setLoading(false);}
  },[from,until,range]);
  useEffect(()=>{const timer=window.setTimeout(()=>void fetchItems(),0);return()=>{window.clearTimeout(timer);requestRef.current?.abort();};},[fetchItems,atualizacao]);
  useEffect(()=>{
    const resume=()=>{if(document.visibilityState==='visible')void fetchItems();};
    window.addEventListener('online',resume);document.addEventListener('visibilitychange',resume);
    return()=>{window.removeEventListener('online',resume);document.removeEventListener('visibilitychange',resume);};
  },[fetchItems]);
  useEffect(()=>{
    const init=window.setTimeout(()=>{setNow(Date.now());setToday(calendarDay(new Date()));setZone(Intl.DateTimeFormat().resolvedOptions().timeZone);if(window.matchMedia('(max-width:700px)').matches)setMode('agenda');},0);
    return()=>window.clearTimeout(init);
  },[]);
  useEffect(()=>{if(side)editor.current?.focus({preventScroll:true});},[side,creating,selected]);
  useEffect(()=>{if(filtersOpen)searchInput.current?.focus();},[filtersOpen]);
  const filterCount=Number(Boolean(search.trim()))+Number(Boolean(owner))+Number(Boolean(status))+Number(priority)+Number(Boolean(source));
  const clearFilters=()=>{setSearch('');setOwner('');setStatus('');setPriority(false);setSource('');};
  const closeTools=()=>{if(toolsMenu.current)toolsMenu.current.open=false;};
  const closeFilters=()=>{setFiltersOpen(false);filtersTrigger.current?.focus();};
  const conflicts=useMemo(()=>calendarConflicts(items),[items]);
  const filtered=useMemo(()=>items.filter(item=>(podeVerEventos||item.camada!=='EVENTO')&&(!source||item.camada===source)&&(!owner||String(item.responsavelId)===owner)&&(!status||item.status===status)&&(!priority||item.prioridade==='P1')&&calendarNormalize([item.titulo,item.responsavel,item.local,item.descricao].join(' ')).includes(calendarNormalize(search.trim()))),[items,podeVerEventos,source,owner,status,priority,search]);
  const scheduled=filtered.filter(item=>item.iniciaEm);
  const backlog=filtered.filter(item=>!item.iniciaEm&&(status==='CONCLUIDO'||item.status!=='CONCLUIDO'));
  const ready=loaded===range;
  const focusHour=mode==='dia'&&scheduled.length?Math.max(0,Math.min(...scheduled.map(item=>Date.parse(item.iniciaEm!)<dates[0].getTime()?0:new Date(item.iniciaEm!).getHours()))-1):8;
  useEffect(()=>{if(ready && (mode==='semana'||mode==='dia') && timeScroll.current)timeScroll.current.scrollTop=focusHour*48;},[mode,ready,from,focusHour]);
  const editing=creating||!!selected;
  const editable=creating||!!selected?.podeEditar;
  const periodText=mode==='dia'?formatDay(reference):mode==='semana'?dates[0].toLocaleDateString('pt-BR',{day:'numeric',month:'short'})+' – '+dates.at(-1)!.toLocaleDateString('pt-BR',{day:'numeric',month:'short',year:'numeric'}):reference.toLocaleDateString('pt-BR',{month:'long',year:'numeric'});
  const open=(item:CalendarItem)=>{setFiltersOpen(false);setSummaryOpen(false);setHelpOpen(false);setSelected(item);setCreating(false);setDraft(toDraft(item,userId));setSide(true);setConflict(false);setAccept(false);setError('');};
  const create=(start='')=>{setFiltersOpen(false);setSummaryOpen(false);setHelpOpen(false);setSelected(null);setCreating(true);setDraft(blank(userId,start));setSide(true);setConflict(false);setAccept(false);setError('');};
  const close=()=>{setSide(false);setSelected(null);setCreating(false);setConflict(false);setAccept(false);};
  const change=(key:keyof Draft,value:string)=>{setDraft(previous=>({...previous,[key]:value}));setAccept(false);};
  function navigate(delta:number){setReference(date=>mode==='mes'||mode==='agenda'?new Date(date.getFullYear(),date.getMonth()+delta,1):nextDay(date,delta*(mode==='semana'?7:1)));setUndo(null);}
  async function mutate(item:CalendarItem|null,value:Draft,allowConflict=false){
    const endpoint=(item?.camada||value.kind)==='TAREFA'?'/api/pilot/agenda/tarefas':'/api/pilot/agenda';
    const response=await fetch(endpoint,{method:item?'PATCH':'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...payload(value),id:item?.origemId,versao:item?.versao,acao:item?'EDITAR':undefined,aceitarConflito:allowConflict}),signal:AbortSignal.timeout(20000)});
    const result=await response.json() as {error?:string;conflito?:boolean;versao?:number;message?:string};
    if(!response.ok){if(result.conflito)setConflict(true);throw Object.assign(new Error(result.error||'Não foi possível salvar.'),{conflito:result.conflito});}
    return result;
  }
  async function save(event:FormEvent<HTMLFormElement>){
    event.preventDefault();if(busy||!editable)return;
    if(draft.kind==='PESSOAL'&&!draft.iniciaEm){setError('Informe a data e hora do compromisso.');return;}
    if(creating&&draft.visibilidade==='PUBLICO'&&!window.confirm('Publicar este compromisso? A comunidade verá o título, horário e local. As observações continuam privadas.'))return;
    setBusy(true);setError('');
    try{await mutate(selected,draft,accept);setFeedback('Registro salvo.');setUndo(null);close();await fetchItems();}
    catch(cause){setError(agendaErrorMessage(cause,true));}
    finally{setBusy(false);}
  }
  async function reschedule(item:CalendarItem,start:string|null,restoring=false,version?:number){
    if(busy||!item.podeEditar)return;
    const value=toDraft(item,userId);
    const duration=item.iniciaEm?Math.max(60000,calendarEnd(item)-Date.parse(item.iniciaEm)):3600000;
    value.iniciaEm=start?calendarLocalInput(start):'';
    value.terminaEm=start?calendarLocalInput(new Date(Date.parse(start)+duration).toISOString()):'';
    let allow=false;
    if(start){const changed={...item,iniciaEm:start,terminaEm:new Date(Date.parse(start)+duration).toISOString()};if(calendarConflicts([...items.filter(other=>other.id!==item.id),changed]).has(item.id)){allow=window.confirm('Há sobreposição de horário para este responsável. Deseja reagendar mesmo assim?');if(!allow)return;}}
    setBusy(true);setError('');
    try{const result=await mutate({...item,versao:version??item.versao},value,allow);setUndo(restoring?null:{item,version:result.versao!});setFeedback(restoring?'Reagendamento desfeito.':'Horário atualizado.');close();await fetchItems();}
    catch(cause){open(item);setDraft(value);setConflict(Boolean((cause as {conflito?:boolean}).conflito));setError(agendaErrorMessage(cause,true));}
    finally{setBusy(false);}
  }
  function drop(event:React.DragEvent,day:Date,hour=9){
    event.preventDefault();setDragOver('');const item=items.find(value=>value.id===event.dataTransfer.getData('text/calendar-item'));
    if(!item?.podeEditar||!ready)return;
    const date=new Date(day.getFullYear(),day.getMonth(),day.getDate(),hour);
    void reschedule(item,date.toISOString());
  }
  async function approve(item:CalendarItem){
    setBusy(true);setError('');
    try{const response=await fetch('/api/pilot/agenda',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:item.origemId,acao:'APROVAR'}),signal:AbortSignal.timeout(20000)});const result=await response.json();if(!response.ok)throw new Error(result.error||'Não foi possível aprovar.');setFeedback('Compromisso aprovado.');close();await fetchItems();}catch(cause){setError(agendaErrorMessage(cause,true));}finally{setBusy(false);}
  }
  async function remove(item:CalendarItem){
    if(!window.confirm('Excluir este compromisso?'))return;
    setBusy(true);setError('');
    try{const response=await fetch('/api/pilot/agenda?id='+item.origemId,{method:'DELETE',signal:AbortSignal.timeout(20000)});const result=await response.json();if(!response.ok)throw new Error(result.error||'Não foi possível excluir.');close();setUndo(null);setFeedback('Compromisso excluído.');await fetchItems();}catch(cause){setError(agendaErrorMessage(cause,true));}finally{setBusy(false);}
  }
  function eventButton(item:CalendarItem,style?:CSSProperties){
    return <button key={item.id} type="button" className="vp-calendar-event" style={style} data-priority={item.prioridade} data-status={statusText(item)} data-conflict={conflicts.has(item.id)} draggable={!!item.podeEditar&&!busy&&ready} onDragStart={event=>{event.dataTransfer.setData('text/calendar-item',item.id);event.dataTransfer.effectAllowed='move';}} onClick={()=>open(item)} title={`${item.titulo} · ${item.iniciaEm?time(item.iniciaEm):'Sem data'} · ${item.responsavel||SOURCE_LABELS[item.camada]} · ${statusText(item)}${conflicts.has(item.id)?' · Conflito de horário':''}`}>
      <span className="vp-event-title">{item.iniciaEm&&!item.diaInteiro&&<>{time(item.iniciaEm)} </>}{item.titulo}</span><span className="vp-event-meta">{item.responsavel||SOURCE_LABELS[item.camada]} · {statusText(item)}</span>
    </button>;
  }
  function timeColumn(day:Date){
    const dayItems=scheduled.filter(item=>!item.diaInteiro&&overlapsDay(item,day)).sort((a,b)=>Date.parse(a.iniciaEm!)-Date.parse(b.iniciaEm!));
    const lanes:number[]=[];
    const positions=dayItems.map(item=>{const start=Math.max(day.getTime(),Date.parse(item.iniciaEm!)),end=Math.min(nextDay(day).getTime(),calendarEnd(item));let lane=lanes.findIndex(value=>value<=start);if(lane<0)lane=lanes.length;lanes[lane]=end;return {item,start,end,lane};});
    return <div key={calendarDay(day)} className={'vp-time-column'+(dragOver===calendarDay(day)?' vp-drop-target':'')} onDragOver={event=>{if(!busy&&ready){event.preventDefault();setDragOver(calendarDay(day));}}} onDragLeave={()=>setDragOver('')} onDrop={event=>{const rect=event.currentTarget.getBoundingClientRect();drop(event,day,Math.max(0,Math.min(23.5,Math.floor((event.clientY-rect.top)/24)/2)));}}>
      {positions.map(({item,start,end,lane})=>{const date=new Date(start),endDate=new Date(end);const minutes=date.getHours()*60+date.getMinutes();const finish=end===nextDay(day).getTime()?1440:endDate.getHours()*60+endDate.getMinutes();return eventButton(item,{top:minutes*.8,height:Math.max(44,(finish-minutes)*.8),left:`calc(${lane*100/lanes.length}% + 2px)`,width:`calc(${100/lanes.length}% - 4px)`});})}
    </div>;
  }
  const statusControl=<label>Status<select value={draft.status} onChange={event=>change('status',event.target.value)}>{Object.entries(draft.kind==='TAREFA'?TASK_STATUSES:{ABERTO:'Planejado',CONCLUIDO:'Concluído'}).map(([value,label])=><option value={value} key={value}>{label}</option>)}</select></label>;
  return <section className="management-calendar" aria-label="Calendário de gestão" data-editing={editing}>
    {headingContent&&<header className="vp-section-heading">{headingContent}</header>}
    <div className="vp-toolbar">
      <div className="vp-period-group"><h1 className="vp-period" aria-label={'Calendário, '+periodText}>{periodText}</h1><nav className="vp-period-nav" aria-label="Navegar pelo período">
        <button type="button" className="vp-button vp-icon-button vp-quiet" aria-label="Período anterior" disabled={busy} onClick={()=>navigate(-1)}>‹</button>
        <button type="button" className="vp-button vp-quiet" disabled={busy} onClick={()=>setReference(dayStart(new Date()))}>Hoje</button>
        <button type="button" className="vp-button vp-icon-button vp-quiet" aria-label="Próximo período" disabled={busy} onClick={()=>navigate(1)}>›</button>
      </nav></div>
      <div className="vp-calendar-actions">
        <select className="vp-view-select" aria-label="Visualização do calendário" value={mode} disabled={busy} onChange={event=>setMode(event.target.value as Mode)}><option value="mes">Mês</option><option value="semana">Semana</option><option value="dia">Dia</option><option value="agenda">Agenda</option></select>
        <button ref={filtersTrigger} className="vp-button vp-filter-trigger" type="button" aria-label="Buscar e filtrar" aria-expanded={filtersOpen} aria-controls={filtersId} data-active={filterCount>0} onClick={()=>setFiltersOpen(value=>!value)}><svg className="vp-tool-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true"><path d="M4 7h16M4 17h16M8 4v6m8 4v6"/></svg>Filtros{filterCount>0&&<span className="vp-filter-count">{filterCount}</span>}</button>
        <details className="vp-tools-menu" ref={toolsMenu} onKeyDown={event=>{if(event.key==='Escape'){event.currentTarget.open=false;event.currentTarget.querySelector('summary')?.focus();}}}>
          <summary className="vp-button vp-icon-button" aria-label="Mais opções do calendário" title="Mais opções">⋯{backlog.length>0&&<span className="vp-menu-count" aria-label={backlog.length+' pendências'}>{backlog.length}</span>}</summary>
          <div className="vp-tools-content">
            <button type="button" aria-label="Mostrar pendências sem data" aria-expanded={side&&!editing} onClick={()=>{close();setSide(!side||editing);closeTools();}}>Pendências sem data <span>{backlog.length}</span></button>
            <button type="button" aria-expanded={summaryOpen} aria-controls={summaryId} onClick={()=>{setSummaryOpen(value=>!value);closeTools();}}>Resumo do período</button>
            {podeVerEventos&&aoVerEvento&&<button type="button" onClick={()=>{aoVerEvento();closeTools();}}>Eventos da comunidade</button>}
            <button type="button" aria-expanded={helpOpen} onClick={()=>{setHelpOpen(value=>!value);closeTools();}}>Sobre o calendário</button>
          </div>
        </details>
        <button type="button" className="vp-button vp-primary vp-new" aria-label="Novo item" disabled={busy||!userId||!ready} onClick={()=>create()}><span aria-hidden="true">＋</span><span className="vp-new-label">Novo</span></button>
      </div>
    </div>
    <div className="vp-filters" id={filtersId} hidden={!filtersOpen} onKeyDown={event=>{if(event.key==="Escape")closeFilters();}}><label className="vp-search"><input ref={searchInput} type="search" aria-label="Buscar no calendário" placeholder="Buscar na agenda…" value={search} onChange={event=>setSearch(event.target.value)}/></label><select aria-label="Filtrar responsável" value={owner} onChange={event=>setOwner(event.target.value)}><option value="">Responsável: todos</option>{Array.from(new Map([...owners,...items.filter(item=>item.responsavelId&&item.responsavel).map(item=>({id:item.responsavelId!,nome:item.responsavel!}))].map(value=>[value.id,value])).values()).map(value=><option value={value.id} key={value.id}>{value.nome}</option>)}</select><select aria-label="Filtrar status" value={status} onChange={event=>setStatus(event.target.value)}><option value="">Todos os status</option>{Array.from(new Set(items.map(item=>item.status))).sort().map(value=><option value={value} key={value}>{statusText(items.find(item=>item.status===value)!)}</option>)}</select><select aria-label="Filtrar origem" value={source} onChange={event=>setSource(event.target.value)}><option value="">Todas as origens</option>{Object.entries(SOURCE_LABELS).filter(([value])=>podeVerEventos||value!=='EVENTO').map(([value,label])=><option value={value} key={value}>{label}</option>)}</select><button className="vp-chip" type="button" aria-pressed={priority} onClick={()=>setPriority(value=>!value)}>Prioridade alta</button>{(search||owner||status||priority||source)&&<button type="button" className="vp-button vp-quiet" onClick={clearFilters}>Limpar filtros</button>}<button type="button" className="vp-button" onClick={closeFilters}>Concluir</button></div>
    {filterCount>0&&!filtersOpen&&<div className="vp-active-filters"><span>{filterCount} {filterCount===1?'filtro ativo':'filtros ativos'}</span><button type="button" onClick={clearFilters}>Limpar</button></div>}
    {summaryOpen&&<div className="vp-metrics" id={summaryId} aria-live="polite"><span><strong>{ready?scheduled.length:'–'}</strong> no período</span><span><strong>{ready?backlog.length:'–'}</strong> sem data</span><span className="vp-conflict-count"><strong>{ready?conflicts.size:'–'}</strong> itens com conflito</span><button type="button" className="vp-button vp-quiet" aria-label="Fechar resumo do período" onClick={()=>setSummaryOpen(false)}>×</button></div>}
    {!summaryOpen&&ready&&conflicts.size>0&&<p className="vp-attention" role="status">{conflicts.size} itens com sobreposição de horário.</p>}
    {helpOpen&&<div className="vp-calendar-help"><p>Consulte datas e abra um item para ver os detalhes. Use Filtros para refinar a busca e Mais opções para acessar pendências e a programação da comunidade.</p><button type="button" className="vp-button vp-quiet" aria-label="Fechar ajuda do calendário" onClick={()=>setHelpOpen(false)}>×</button></div>}
    {error&&<div className="vp-feedback vp-error" role="alert"><span>{error}{loaded&&' Última consulta preservada.'}</span><button type="button" disabled={busy||loading} onClick={()=>void fetchItems()}>Atualizar</button></div>}
    {limited&&<p className="vp-form-error">Limite de 400 tarefas atingido. Reduza o período para consultar os itens agendados.</p>}
    <div className={'vp-workspace'+(!side?' no-side':'')+(side?' side-open':'')}>
      <div className="vp-calendar-main" aria-busy={loading&&!ready}>
        {!ready?<p className="vp-empty">{loading?'Carregando calendário…':'Atualize para consultar este período.'}</p>:mode==='mes'?<div className="vp-month-scroll"><div className="vp-month-head">{days.map(value=><span key={value}>{value}</span>)}</div><div className="vp-month-grid">{dates.map(day=>{const key=calendarDay(day),entries=scheduled.filter(item=>overlapsDay(item,day));return <div key={key} className={'vp-day-cell'+(day.getMonth()!==reference.getMonth()?' vp-outside':'')+(dragOver===key?' vp-drop-target':'')} onDragOver={event=>{if(!busy){event.preventDefault();setDragOver(key);}}} onDragLeave={()=>setDragOver('')} onDrop={event=>drop(event,day)}>
          <button className="vp-date-number" type="button" aria-label={formatDay(day)+(entries.length?`, ${entries.length} itens`:'')} aria-current={key===today?'date':undefined} onClick={()=>{setReference(day);setMode('dia');}}>{day.getDate()}</button>{entries.slice(0,3).map(item=>eventButton(item))}{entries.length>3&&<button className="vp-more" type="button" onClick={()=>{setReference(day);setMode('dia');}}>＋{entries.length-3} itens</button>}{entries.length>0&&<span className="vp-mobile-count" aria-hidden="true">{'•'.repeat(Math.min(entries.length,3))}</span>}</div>;})}</div></div>:mode==='agenda'?<div className="vp-agenda">{scheduled.length?dates.map(day=>{const entries=scheduled.filter(item=>overlapsDay(item,day)).sort((a,b)=>Date.parse(a.iniciaEm!)-Date.parse(b.iniciaEm!));return entries.length?<div key={calendarDay(day)}><h2 className="vp-agenda-day">{formatDay(day)}</h2>{entries.map(item=><button type="button" className="vp-agenda-row" key={item.id} onClick={()=>open(item)}><span className="vp-agenda-time">{item.diaInteiro?'Dia inteiro':calendarDay(item.iniciaEm!)!==calendarDay(day)?'Continua':time(item.iniciaEm!)}</span><span className="vp-agenda-title">{item.titulo}<span className="vp-agenda-sub">{SOURCE_LABELS[item.camada]}{item.local&&' · '+item.local}{item.prazoEm&&' · Prazo '+new Date(item.prazoEm).toLocaleDateString('pt-BR')}{conflicts.has(item.id)&&' · ! Conflito'}</span></span><span className="vp-agenda-owner">{item.responsavel||'Comunidade'}</span><span className="vp-status" data-status={statusText(item)}>{statusText(item)}</span></button>)}</div>:null;}):<p className="vp-empty">Nenhum item neste período com os filtros atuais.</p>}</div>:<><p className="vp-swipe-note">Deslize a grade para consultar os dias e horários.</p><div className="vp-time-scroll" ref={timeScroll}><div className={'vp-time-days'+(mode==='dia'?' vp-day-view':'')}><div className="vp-time-heading">Hora</div>{dates.map(day=><div className="vp-time-heading" key={calendarDay(day)}><button type="button" onClick={()=>{setReference(day);setMode('dia');}}>{days[day.getDay()]}<b>{day.getDate()}</b></button>{scheduled.filter(item=>item.diaInteiro&&overlapsDay(item,day)).map(item=>eventButton(item))}</div>)}<div className="vp-time-axis">{Array.from({length:24},(_,hour)=><span key={hour} className="vp-time-label" style={{'--hour':hour} as CSSProperties}>{String(hour).padStart(2,'0')}:00</span>)}</div>{dates.map(timeColumn)}</div></div></>}
      </div>
      {side&&<aside className="vp-side" aria-label="Apoio ao planejamento" onKeyDown={event=>{if(event.key==="Escape"&&!busy)close();}}><div className="vp-side-heading"><h2 ref={editor} tabIndex={-1}>{creating?'Novo item':selected?(selected.podeEditar?'Detalhes do item':selected.titulo):'Sem data'}{!editing&&` · ${backlog.length}`}</h2><button className="vp-button vp-icon-button vp-quiet" type="button" disabled={busy} aria-label={editing?'Fechar detalhes':'Fechar pendências'} onClick={close}>×</button></div>
        {!editing?<><p className="vp-side-description">Arraste uma tarefa para a grade ou use Agendar.</p>{backlog.length?backlog.map(item=><div className="vp-backlog-row" key={item.id} draggable={!!item.podeEditar&&!busy} onDragStart={event=>{event.dataTransfer.setData('text/calendar-item',item.id);event.dataTransfer.effectAllowed='move';}}><button className="vp-backlog-title" type="button" onClick={()=>open(item)}>{item.titulo}</button><p className="vp-backlog-meta">{item.responsavel} · {statusText(item)}</p>{item.prazoEm&&<p className={'vp-backlog-meta'+(Date.parse(item.prazoEm)<now?' vp-overdue':'')}>Prazo {new Date(item.prazoEm).toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'})}</p>}<div className="vp-backlog-footer"><span className="vp-priority" data-level={item.prioridade}>{item.prioridade}</span>{item.podeEditar&&<button type="button" disabled={busy||!ready} onClick={()=>{open(item);setDraft({...toDraft(item,userId),iniciaEm:calendarDay(reference)+'T09:00'});}}>Agendar →</button>}</div></div>):<p className="vp-side-description">Nenhuma pendência sem data.</p>}</>:<>
        {selected&&<p className="vp-side-description">{SOURCE_LABELS[selected.camada]} · {statusText(selected)}{selected.aprovacaoStatus==='PENDENTE'?' · Aguardando aprovação':''}</p>}
        {!editable&&selected?<div className="vp-readonly"><p>{selected.iniciaEm&&new Date(selected.iniciaEm).toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'})}</p>{selected.local&&<p>{selected.local}</p>}{selected.descricao&&<p>{selected.descricao}</p>}{selected.camada==='EVENTO'&&<button type="button" className="vp-button" onClick={()=>{aoVerEvento?.(selected.origemId);close();}}>Ver evento →</button>}{selected.camada==='ESCALA'&&<a href="/painel?view=ministerios" className="vp-button">Abrir ministérios →</a>}{podeAprovar&&selected.camada==='PESSOAL'&&selected.aprovacaoStatus==='PENDENTE'&&<button type="button" className="vp-button vp-primary" disabled={busy} onClick={()=>void approve(selected)}>Aprovar publicação</button>}</div>:
        <form className="vp-side-form" onSubmit={save} onInvalidCapture={event=>{const details=(event.target as HTMLElement).closest("details");if(details)details.open=true;}}>
          {creating&&<><label>Tipo<select value={draft.kind} onChange={event=>{if(event.target.value==='EVENTO'){close();aoCriarEvento?.(calendarDay(reference));return;}const kind=event.target.value as Draft['kind'];setDraft(previous=>({...previous,kind,status:kind==='TAREFA'?'PLANEJADO':'ABERTO',visibilidade:'PRIVADO',responsavelId:String(userId)}));}}><option value="TAREFA">Tarefa de gestão</option><option value="PESSOAL">Compromisso pessoal</option>{aoCriarEvento&&<option value="EVENTO">Evento da comunidade</option>}</select></label></>}
          <label>Título*<input name="titulo" required maxLength={140} value={draft.titulo} onChange={event=>change('titulo',event.target.value)}/></label>
          {draft.kind==='TAREFA'&&<label>Responsável<select value={draft.responsavelId} disabled={!podeAprovar&&!creating} onChange={event=>change('responsavelId',event.target.value)}>{owners.map(value=><option value={value.id} key={value.id}>{value.nome}</option>)}{selected?.responsavelId&&!owners.some(value=>value.id===selected.responsavelId)&&<option value={selected.responsavelId}>{selected.responsavel}</option>}</select></label>}
          <label>Data agendada{draft.kind==='PESSOAL'?'*':' (opcional)'}<input type="datetime-local" name="iniciaEm" required={draft.kind==='PESSOAL'} value={draft.iniciaEm} onChange={event=>{change('iniciaEm',event.target.value);if(!event.target.value)change('terminaEm','');}}/></label>
          {!creating&&statusControl}
          {draft.status==='BLOQUEADO'&&<label>Motivo do bloqueio*<textarea required maxLength={500} value={draft.motivoBloqueio} onChange={event=>change('motivoBloqueio',event.target.value)}/></label>}
          {creating&&<label>Visibilidade<select value={draft.visibilidade} onChange={event=>change('visibilidade',event.target.value)}><option value="PRIVADO">Só para mim</option>{(draft.kind==='PESSOAL'||podeAprovar)&&<option value={draft.kind==='PESSOAL'?'PUBLICO':'COMUNIDADE'}>Comunidade{draft.kind==='PESSOAL'&&!podeAprovar?' (sujeito à aprovação)':''}</option>}</select></label>}
          <details className="vp-item-options" data-keep-open-on-outside><summary>Mais detalhes</summary><div>
          <label>Término (opcional)<input type="datetime-local" name="terminaEm" disabled={!draft.iniciaEm} min={draft.iniciaEm||undefined} value={draft.terminaEm} onChange={event=>change('terminaEm',event.target.value)}/></label>
          {draft.kind==='TAREFA'&&<><label>Prazo final (opcional)<input type="datetime-local" name="prazoEm" value={draft.prazoEm} onChange={event=>change('prazoEm',event.target.value)}/></label><label>Prioridade<select value={draft.prioridade} onChange={event=>change('prioridade',event.target.value)}><option value="P1">P1 · Alta</option><option value="P2">P2 · Normal</option><option value="P3">P3 · Baixa</option></select></label></>}
          {draft.kind==='PESSOAL'&&<label>Local<input maxLength={180} value={draft.local} onChange={event=>change('local',event.target.value)}/></label>}
          <label>Observações<textarea maxLength={draft.kind==='TAREFA'?2000:1000} value={draft.descricao} onChange={event=>change('descricao',event.target.value)}/></label>
          {creating&&statusControl}
          </div></details>
          {conflict&&<label className="vp-conflict-accept"><input type="checkbox" checked={accept} onChange={event=>setAccept(event.target.checked)}/>Confirmo a sobreposição de horário.</label>}
          <div className="vp-side-actions"><button type="button" className="vp-button" disabled={busy} onClick={close}>Cancelar</button><button type="submit" className="vp-button vp-primary" disabled={busy||!ready||(conflict&&!accept)}>{busy?'Salvando…':'Salvar'}</button></div>
          {selected?.camada==='PESSOAL'&&selected.meu&&<button className="vp-button vp-quiet" type="button" disabled={busy} onClick={()=>void remove(selected)}>Excluir compromisso</button>}
          {selected?.camada==='TAREFA'&&selected.iniciaEm&&<button className="vp-button vp-quiet" type="button" disabled={busy||!ready} onClick={()=>void reschedule(selected,null)}>Mover para sem data</button>}
          {selected?.camada==='PESSOAL'&&podeAprovar&&selected.aprovacaoStatus==='PENDENTE'&&<button type="button" className="vp-button" disabled={busy} onClick={()=>void approve(selected)}>Aprovar publicação</button>}
        </form>}</>}
      </aside>}
    </div>
    {helpOpen&&<div className="vp-bottomline"><span>P1 Alta · P2 Normal · P3 Baixa · ! Conflito · <a href="/painel?view=fio">Fio do dia ↗</a></span><span>Fuso deste dispositivo{zone?' · '+zone:''}</span></div>}
    {feedback&&<div className="vp-feedback" role="status"><span>{feedback}</span><div>{undo&&<button type="button" disabled={busy||!ready} onClick={()=>void reschedule(undo.item,undo.item.iniciaEm,true,undo.version)}>Desfazer</button>}<button type="button" aria-label="Fechar confirmação" onClick={()=>{setFeedback('');setUndo(null);}}>×</button></div></div>}
  </section>;
}
