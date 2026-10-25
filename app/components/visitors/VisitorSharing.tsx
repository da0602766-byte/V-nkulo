"use client";
import {useCallback,useEffect,useRef,useState} from 'react';
import {btnPri,btnSec} from './Views';

type Grant={usuario_id:number;nome:string;papel:'READ'|'EDIT';status:string;ativo:number};
type Snapshot={canManage:boolean;reason?:string;locked?:boolean;hasMore?:boolean;members:{id:number;nome:string}[];grants:Grant[]};
const endpoint='/api/pilot/visitantes/compartilhamento';

export default function VisitorSharing() {
  const [data,setData]=useState<Snapshot|null>(null),[search,setSearch]=useState(''),[user,setUser]=useState(''),[role,setRole]=useState('READ');
  const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
  const [expanded,setExpanded]=useState<number|null>(null),[revoking,setRevoking]=useState<number|null>(null),[retry,setRetry]=useState(0);
  const working=useRef(false),sequence=useRef(0);
  const load=useCallback(async(signal?:AbortSignal)=>{
    const id=++sequence.current;
    const r=await fetch(`${endpoint}?busca=${encodeURIComponent(search)}`,{cache:'no-store',signal});
    const body=await r.json();if(!r.ok)throw new Error(body.error||'Não foi possível carregar os acessos.');
    if(id===sequence.current&&!signal?.aborted)setData(body);
  },[search]);
  useEffect(()=>{
    const controller=new AbortController();
    const timer=setTimeout(()=>void load(controller.signal).catch(e=>{if(!controller.signal.aborted)setError(e.message);}).finally(()=>{if(!controller.signal.aborted)setLoading(false);}),200);
    return()=>{clearTimeout(timer);controller.abort();};
  },[load,retry]);
  async function act(action:'grant'|'revoke',userId:number,accessRole?:string) {
    if(working.current)return;working.current=true;setBusy(true);setError('');setMessage('');
    try {
      const r=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,userId,role:accessRole})});
      const body=await r.json();if(!r.ok)throw new Error(body.error||'Não foi possível salvar o acesso.');
      setMessage(action==='grant'?'Acesso salvo. O membro já pode abrir Visitantes pelo painel da comunidade.':'Compartilhamento removido. Acessos concedidos pelo cargo ou por outras permissões continuam válidos.');
      setUser('');setRevoking(null);setExpanded(null);await load();
    }catch(e){setError((e as Error).message);}finally{working.current=false;setBusy(false);}
  }
  const disabled=loading||busy||!!data?.locked;
  return <div className="vp-scroll vp-drive vp-sharing" aria-busy={loading||busy}>
    <p>Compartilhe a lista completa de Visitantes com outro membro da comunidade, incluindo fichas ativas, arquivadas e histórico de contatos. As anotações pessoais continuam privadas.</p>
    {error&&<p className="vp-error" role="alert">{error} <button className={btnSec} disabled={busy} onClick={()=>{setLoading(true);setError('');setRetry(v=>v+1);}}>Tentar novamente</button></p>}
    {message&&<p className="vp-drive-message" role="status">{message}</p>}
    {(loading||busy)&&<p role="status">{busy?'Salvando acesso…':'Carregando acessos…'}</p>}
    {data&&!data.canManage&&<p>{data.reason}</p>}
    {data?.canManage&&<>
      {data.locked&&<p role="alert">Conclua ou cancele a migração em Armazenamento e acessos antes de alterar o compartilhamento.</p>}
      <section><h2>Compartilhar com um membro</h2>
        <label>Buscar membro pelo nome<input type="search" value={search} disabled={busy} onChange={e=>{setSearch(e.target.value);setUser('');setLoading(true);setError('');}} placeholder="Digite o nome para encontrar"/></label>
        <form className="vp-drive-share" onSubmit={e=>{e.preventDefault();if(!disabled&&user)void act('grant',Number(user),role);}}>
          <label>Membro<select aria-label="Membro" required value={user} disabled={disabled} onChange={e=>setUser(e.target.value)}><option value="">Selecione um membro</option>{data.members.map(m=><option key={m.id} value={m.id}>{m.nome}</option>)}</select></label>
          <label>Acesso<select aria-label="Acesso" value={role} disabled={disabled} onChange={e=>setRole(e.target.value)}><option value="READ">Consultar</option><option value="EDIT">Consultar e editar</option></select></label>
          <button className={btnPri} disabled={disabled||!user}>Compartilhar lista</button>
        </form>
        {!loading&&!data.members.length&&<p>Nenhum outro membro ativo encontrado. Confira a busca e o vínculo da pessoa com a comunidade.</p>}
        {data.hasMore&&<p>Exibindo os primeiros 50 membros. Digite um nome para encontrar os demais.</p>}
        <p>Consultar permite visualizar e exportar. Consultar e editar também permite cadastrar, atualizar fichas e registrar contatos. Este compartilhamento não concede exclusão nem gestão de acessos.</p>
      </section>
      <section><h2>Lista compartilhada com</h2>
        <p>Permissões já concedidas pelo cargo ou em Pessoas continuam válidas. Remover este compartilhamento não retira esses outros acessos.</p>
        <ul className="vp-sharing-grants">{data.grants.length?data.grants.map(g=><li key={g.usuario_id}>
          <div className="vp-sharing-row"><div><strong>{g.nome}</strong><small>{g.papel==='EDIT'?'Consulta e edição':'Consulta'}{g.status!=='ATIVO'||!g.ativo?' · Vínculo inativo':''}</small></div>
            <button className={btnSec} disabled={disabled} aria-label={`Opções de acesso de ${g.nome}`} aria-expanded={expanded===g.usuario_id} aria-controls={`visitor-share-${g.usuario_id}`} onClick={()=>{setExpanded(expanded===g.usuario_id?null:g.usuario_id);setRevoking(null);}}>Opções</button></div>
          {expanded===g.usuario_id&&<div id={`visitor-share-${g.usuario_id}`} className="vp-sharing-options">{revoking===g.usuario_id?<>
            <p>Remover o compartilhamento com {g.nome}? A pessoa perderá o acesso concedido aqui. Cópias já exportadas e permissões do cargo serão mantidas.</p>
            <div className="vp-actions"><button className={btnSec} disabled={disabled} onClick={()=>setRevoking(null)}>Cancelar</button><button className={btnPri} disabled={disabled} onClick={()=>void act('revoke',g.usuario_id)}>Confirmar remoção</button></div>
          </>:<div className="vp-actions"><button className={btnSec} disabled={disabled||g.status!=='ATIVO'||!g.ativo} onClick={()=>void act('grant',g.usuario_id,g.papel==='READ'?'EDIT':'READ')}>{g.papel==='READ'?'Permitir edição':'Permitir só consulta'}</button><button className={btnSec} disabled={disabled} onClick={()=>setRevoking(g.usuario_id)}>Remover compartilhamento</button></div>}</div>}
        </li>):<li>Nenhum compartilhamento direto cadastrado.</li>}</ul>
      </section>
    </>}
  </div>;
}
