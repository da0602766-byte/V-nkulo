"use client";
import {useCallback,useEffect,useRef,useState} from 'react';
import {btnPri,btnSec,Icon,I} from './Views';

type Role='READ'|'EDIT';
type Grant={usuario_id:number;nome:string;papel:Role;status:string;ativo:number};
type History={id:number;acao:'CONCEDIDO'|'ALTERADO'|'REMOVIDO';papel_anterior:Role|null;papel:Role|null;criado_em:string;autor:string;membro:string};
type Snapshot={canManage:boolean;reason?:string;locked?:boolean;hasMore?:boolean;members:{id:number;nome:string}[];grants:Grant[];history:History[];nextCursor:number|null;myRole:Role|null;canViewList:boolean;communityName:string};
const endpoint='/api/pilot/visitantes/compartilhamento';
const roleName=(role:Role|null)=>role==='EDIT'?'Consulta e edição':role==='READ'?'Somente consulta':'Sem compartilhamento';
const eventName={CONCEDIDO:'Acesso concedido',ALTERADO:'Permissão alterada',REMOVIDO:'Compartilhamento removido'};
function dateLabel(value:string){return new Date(value.replace(' ','T')+'Z').toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'});}

export default function VisitorSharing({onNavigate}:{onNavigate:(section:'pessoas'|'armazenamento')=>void}) {
  const [data,setData]=useState<Snapshot|null>(null),[search,setSearch]=useState(''),[user,setUser]=useState(''),[role,setRole]=useState<Role>('READ');
  const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
  const [expanded,setExpanded]=useState<number|null>(null),[revoking,setRevoking]=useState<number|null>(null),[retry,setRetry]=useState(0);
  const [help,setHelp]=useState(false),[searchOpen,setSearchOpen]=useState(false),[historyOpen,setHistoryOpen]=useState(false),[historyBusy,setHistoryBusy]=useState(false),[historyError,setHistoryError]=useState('');
  const working=useRef(false),sequence=useRef(0),feedback=useRef<HTMLDivElement>(null),memberField=useRef<HTMLSelectElement>(null),historyWorking=useRef(false);
  const load=useCallback(async(signal?:AbortSignal)=>{
    const id=++sequence.current;
    const r=await fetch(`${endpoint}?busca=${encodeURIComponent(search)}`,{cache:'no-store',signal:signal?AbortSignal.any([signal,AbortSignal.timeout(20000)]):AbortSignal.timeout(20000)});
    const body=await r.json().catch(()=>null);if(!r.ok||!Array.isArray(body?.members))throw new Error(body?.error||'Não foi possível carregar os acessos. Use Atualizar lista.');
    if(id===sequence.current&&!signal?.aborted){setData(body);setHistoryError('');}
  },[search]);
  useEffect(()=>{
    const controller=new AbortController();
    const timer=setTimeout(()=>void load(controller.signal).catch(e=>{if(!controller.signal.aborted)setError(['TimeoutError','TypeError','AbortError'].includes(e.name)?'A conexão não respondeu. Use Atualizar lista para tentar novamente.':e.message);}).finally(()=>{if(!controller.signal.aborted)setLoading(false);}),200);
    return()=>{clearTimeout(timer);controller.abort();};
  },[load,retry]);
  useEffect(()=>{if(error||message){feedback.current?.focus({preventScroll:true});feedback.current?.scrollIntoView({block:'nearest'});}},[error,message]);
  function refresh(){setLoading(true);setError('');setRetry(v=>v+1);}
  async function act(action:'grant'|'revoke',userId:number,accessRole?:Role){
    if(working.current)return;working.current=true;setBusy(true);setError('');setMessage('');
    try{
      const r=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,userId,role:accessRole}),signal:AbortSignal.timeout(20000)});
      const body=await r.json().catch(()=>null);if(!r.ok||body?.ok!==true)throw new Error(body?.error||'Não foi possível confirmar a operação. Atualize a lista e confira o acesso.');
      const title=body.action==='CONCEDIDO'?'Lista compartilhada com':body.action==='ALTERADO'?'Permissão atualizada para':'Compartilhamento removido de';
      setMessage(body.changed===false?body.message:`${title} ${body.memberName}.${body.notified?' Aviso enviado ao sino do membro.':''}`);
      setUser('');setRole('READ');setRevoking(null);setExpanded(null);
      try{await load();}catch{setError('A alteração foi salva, mas a lista não atualizou. Use Atualizar lista.');}
    }catch(e){setError(e instanceof Error&&['TimeoutError','TypeError','AbortError'].includes(e.name)?'Não foi possível confirmar a operação. Atualize a lista antes de tentar novamente.':(e as Error).message);}
    finally{working.current=false;setBusy(false);}
  }
  async function moreHistory(){
    if(!data?.nextCursor||historyWorking.current)return;historyWorking.current=true;setHistoryBusy(true);setHistoryError('');
    const generation=sequence.current;
    try{const r=await fetch(`${endpoint}?history=1&before=${data.nextCursor}`,{cache:'no-store',signal:AbortSignal.timeout(20000)});const body=await r.json();if(!r.ok)throw new Error(body.error||'Não foi possível carregar o histórico.');
      if(sequence.current===generation)setData(current=>current?{...current,history:[...current.history,...body.history.filter((h:History)=>!current.history.some(v=>v.id===h.id))],nextCursor:body.nextCursor}:current);
    }catch{setHistoryError('Não foi possível carregar as alterações anteriores. Tente novamente.');}finally{historyWorking.current=false;setHistoryBusy(false);}
  }
  const disabled=loading||busy||!!data?.locked,selected=data?.members.find(m=>String(m.id)===user),existing=data?.grants.find(g=>String(g.usuario_id)===user),same=existing?.papel===role;
  return <div className="vp-scroll vp-sharing" aria-busy={loading||busy}>
    <div ref={feedback} tabIndex={-1} className="vp-sharing-feedback" hidden={!error&&!message&&!busy}>
      {busy&&<p role="status">Salvando acesso…</p>}
      {message&&<div className="vp-sharing-success" role="status"><Icon d={I.checkCircle}/><p>{message}</p><button type="button" aria-label="Fechar confirmação" onClick={()=>setMessage('')}><Icon d={I.x}/></button></div>}
      {error&&<div className="vp-sharing-error" role="alert"><p>{error}</p><button className={btnSec} disabled={busy||loading} onClick={refresh}>Atualizar lista</button></div>}
    </div>
    {!data&&loading&&<p role="status">Carregando compartilhamento…</p>}
    {data&&<>
      <section className="vp-sharing-intro"><div><h2>{data.canManage?'Cuide dos contatos com sua equipe':'Seu acesso aos contatos'}</h2><p>{data.canManage?'Escolha um membro, defina o acesso e compartilhe. Ele receberá um aviso no painel.':data.canViewList?`A lista de ${data.communityName} está disponível para você.`:'Você ainda não tem acesso à lista desta comunidade.'}</p></div>
        <button className={btnSec} aria-expanded={help} aria-controls="vp-sharing-help" onClick={()=>setHelp(v=>!v)}><Icon d={I.info}/>{help?'Fechar ajuda':'Como funciona'}</button>
        {help&&<div id="vp-sharing-help" className="vp-sharing-help">{data.canManage?<ol><li><strong>Escolha quem recebe.</strong> O membro precisa ter vínculo ativo nesta comunidade.</li><li><strong>Defina o acesso.</strong> Consulta permite ver e exportar; edição também permite cadastrar e registrar contatos.</li><li><strong>Confirme o compartilhamento.</strong> O membro abre pelo sino do painel ou em Visitantes.</li></ol>:<ol><li><strong>Abra os contatos.</strong> Use o botão Abrir contatos ou entre em Pessoas.</li><li><strong>Confira sua permissão.</strong> Consulta permite ver e exportar. Edição também permite cadastrar e registrar contatos.</li><li><strong>Precisa de outro acesso?</strong> Peça ao responsável pela lista.</li></ol>}<p>A lista inteira é compartilhada, inclusive arquivados e histórico de contatos. Anotações pessoais ficam privadas. As permissões do cargo continuam válidas. Excluir fichas e gerenciar acessos exigem outras permissões.</p></div>}
      </section>
      {!data.canManage&&<section className="vp-sharing-received"><strong>{data.myRole?roleName(data.myRole):data.canViewList?'Acesso pelo seu perfil':'Acesso não concedido'}</strong><p>{data.reason}</p>{data.canViewList&&<button className={btnPri} onClick={()=>onNavigate('pessoas')}>Abrir contatos</button>}</section>}
      {data.canManage&&<>
        {data.locked?<section className="vp-sharing-blocked" role="status"><Icon d={I.alert}/><div><h2>Falta resolver a migração para o Drive</h2><p>O compartilhamento está pausado. Conclua ou cancele a preparação para liberar os acessos.</p><button className={btnPri} onClick={()=>onNavigate('armazenamento')}>Resolver em Armazenamento e acessos</button></div></section>:<section className="vp-sharing-form-section">
          <h2>Novo compartilhamento</h2>
          <form onSubmit={e=>{e.preventDefault();if(!disabled&&user&&!same)void act('grant',Number(user),role);}}>
            <div className="vp-sharing-fields"><div className="vp-sharing-field"><label htmlFor="vp-share-member">1. Membro</label><select ref={memberField} id="vp-share-member" required value={user} disabled={disabled} onChange={e=>{const id=e.target.value;setUser(id);const grant=data.grants.find(g=>String(g.usuario_id)===id);setRole(grant?.papel||'READ');}}><option value="">Selecione quem terá acesso</option>{data.members.map(m=><option key={m.id} value={m.id}>{m.nome}</option>)}</select></div>
              <div className="vp-sharing-field"><label htmlFor="vp-share-role">2. Permissão</label><select id="vp-share-role" value={role} disabled={disabled} aria-describedby="vp-share-role-hint" onChange={e=>setRole(e.target.value as Role)}><option value="READ">Somente consulta</option><option value="EDIT">Consulta e edição</option></select></div>
              <button className={btnPri} disabled={disabled||!user||same}>{busy?'Salvando…':existing?'Salvar permissão':'Compartilhar lista'}</button></div>
            <div className="vp-sharing-form-hints"><p id="vp-share-role-hint">{role==='READ'?'Pode visualizar e exportar os contatos.':'Pode também cadastrar, editar e registrar contatos.'}</p><button type="button" className="vp-sharing-text-button" disabled={busy} aria-expanded={searchOpen} aria-controls="vp-share-search" onClick={()=>{setSearchOpen(v=>!v);if(search){setSearch('');setUser('');setLoading(true);}}}>Buscar por nome</button></div>
            {searchOpen&&<div id="vp-share-search" className="vp-sharing-search"><label htmlFor="vp-share-query">Nome do membro</label><input id="vp-share-query" type="search" value={search} disabled={busy} maxLength={80} onChange={e=>{setSearch(e.target.value);setUser('');setLoading(true);setError('');}} placeholder="Digite parte do nome"/></div>}
            {loading&&<p role="status">Atualizando membros…</p>}
            {!loading&&!data.members.length&&<p role="status">Nenhum membro encontrado.{search?' Tente outro nome.':' A pessoa precisa entrar na comunidade primeiro.'}</p>}
            {data.hasMore&&<p>Mais de 50 membros. Use Buscar por nome para encontrar os demais.</p>}
            {same&&<p role="status">{selected?.nome} já tem esse acesso. Escolha outra permissão para alterar.</p>}
          </form>
        </section>}
        <section className="vp-sharing-access"><div className="vp-sharing-section-title"><h2>Quem recebeu acesso <span>{data.grants.length}</span></h2><button className="vp-sharing-text-button" disabled={busy||loading} onClick={refresh}><Icon d={I.refresh}/>Atualizar lista</button></div>
          <ul className="vp-sharing-grants">{data.grants.length?data.grants.map(g=><li key={g.usuario_id}>
            <div className="vp-sharing-row"><div><strong>{g.nome}</strong><small>{roleName(g.papel)}{g.status!=='ATIVO'||!g.ativo?' · Membro inativo':''}</small></div><button className={btnSec} disabled={disabled} aria-label={`Opções de acesso de ${g.nome}`} aria-expanded={expanded===g.usuario_id} aria-controls={`visitor-share-${g.usuario_id}`} onClick={()=>{setExpanded(expanded===g.usuario_id?null:g.usuario_id);setRevoking(null);}}>Opções</button></div>
            {expanded===g.usuario_id&&<div id={`visitor-share-${g.usuario_id}`} className="vp-sharing-options">{revoking===g.usuario_id?<><p>Remover o acesso de <strong>{g.nome}</strong>? Cópias exportadas e permissões do cargo serão mantidas.</p><div className="vp-actions"><button className={btnSec} disabled={disabled} onClick={()=>setRevoking(null)}>Cancelar</button><button className={btnPri} disabled={disabled} onClick={()=>void act('revoke',g.usuario_id)}>Confirmar remoção</button></div></>:<div className="vp-actions"><button className={btnSec} disabled={disabled||g.status!=='ATIVO'||!g.ativo} onClick={()=>void act('grant',g.usuario_id,g.papel==='READ'?'EDIT':'READ')}>{g.papel==='READ'?'Permitir edição':'Permitir só consulta'}</button><button className={btnSec} disabled={disabled} onClick={()=>setRevoking(g.usuario_id)}>Remover acesso</button></div>}</div>}
          </li>):<li className="vp-sharing-empty">Nenhum acesso compartilhado ainda.{!data.locked&&<button className="vp-sharing-text-button" onClick={()=>{memberField.current?.focus();memberField.current?.scrollIntoView({block:'center'});}}>Escolher primeiro membro</button>}</li>}</ul>
        </section>
      </>}
      <section className="vp-sharing-history"><button className="vp-sharing-history-toggle" aria-expanded={historyOpen} aria-controls="vp-share-history" onClick={()=>setHistoryOpen(v=>!v)}><Icon d={I.clock}/><span>Histórico de alterações</span><small>Últimos 30 dias</small><Icon d={historyOpen?I.chevronDown:I.chevronRight}/></button>
        {historyOpen&&<div id="vp-share-history"><p className="vp-sharing-retention">Concessões, alterações de permissão e remoções. Os registros expiram e são apagados após 30 dias; os acessos continuam válidos.</p>
          {data.history.length?<ol>{data.history.map(h=><li key={h.id}><div><strong>{eventName[h.acao]}</strong><time dateTime={h.criado_em.replace(' ','T')+'Z'}>{dateLabel(h.criado_em)}</time></div><p>{h.membro} · {h.papel_anterior?`${roleName(h.papel_anterior)} → `:''}{roleName(h.papel)}</p><small>Por {h.autor}</small></li>)}</ol>:<p>Nenhuma alteração registrada nos últimos 30 dias. Os novos compartilhamentos aparecerão aqui.</p>}
          {historyError&&<p role="alert">{historyError}</p>}{data.nextCursor&&<button className={btnSec} disabled={historyBusy||busy||loading} onClick={()=>void moreHistory()}>{historyBusy?'Carregando…':'Ver alterações anteriores'}</button>}
        </div>}
      </section>
    </>}
  </div>;
}
