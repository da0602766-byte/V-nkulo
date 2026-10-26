'use client';
import {useCallback,useEffect,useRef,useState,type MouseEvent} from 'react';
import type {VisitorListEntry} from '../../lib/visitor-list-directory';
import {api} from './data';
import {Icon,I,btnSec} from './Views';
import './visitor-list-directory.css';

export default function VisitorListDirectory(){
  const [lists,setLists]=useState<VisitorListEntry[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState(''),[opening,setOpening]=useState(''),[search,setSearch]=useState('');
  const generation=useRef(0),working=useRef(false);
  const refresh=useCallback(async()=>{
    const id=++generation.current;setLoading(true);setError('');
    try{const result=await api<{lists:VisitorListEntry[]}>('/api/pilot/visitantes/listas');if(id===generation.current)setLists(result.lists);}
    catch(e){if(id===generation.current){setLists([]);setError((e as Error).message);}}
    finally{if(id===generation.current)setLoading(false);}
  },[]);
  useEffect(()=>{void refresh();const focus=()=>{if(!working.current)void refresh();};window.addEventListener('focus',focus);const timer=setInterval(()=>{if(document.visibilityState==='visible')focus();},60000);return()=>{generation.current++;window.removeEventListener('focus',focus);clearInterval(timer);};},[refresh]);
  async function open(e:MouseEvent<HTMLAnchorElement>,entry:VisitorListEntry){
    if(e.button!==0||e.ctrlKey||e.metaKey||e.shiftKey||e.altKey)return;
    e.preventDefault();if(working.current)return;working.current=true;setOpening(entry.id);setError('');
    try{
      // Recheck before switching communities; the destination also authorizes every request.
      const current=await api<{lists:VisitorListEntry[]}>('/api/pilot/visitantes/listas');
      setLists(current.lists);
      if(!current.lists.some(list=>list.id===entry.id))throw new Error('Este acesso não está mais disponível. Peça ao responsável para conferir sua permissão.');
      await api('/api/pilot/comunidade-ativa','POST',{comunidadeId:entry.communityId});
      location.assign(entry.href);
    }catch(e){setError((e as Error).message);setOpening('');working.current=false;}
  }
  const normalize=(value:string)=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR');
  const filtered=lists.filter(list=>normalize([list.title,list.ownerName,list.sharedByName,list.communityName].join(' ')).includes(normalize(search.trim())));
  return <section className="vp-list-directory" aria-labelledby="visitor-lists-title">
    <header><div><p className="vp-list-eyebrow">PESSOAS</p><h1 id="visitor-lists-title">Listas disponíveis</h1><p>Listas que outros usuários compartilharam com você nesta comunidade.</p></div><button className={btnSec} disabled={loading||!!opening} onClick={()=>void refresh()}><Icon d={I.refresh}/>{loading?'Atualizando…':'Atualizar acessos'}</button></header>
    {error&&<p className="vp-error" role="alert">{error}</p>}
    <p className="vp-sr-only" role="status">{opening?'Abrindo lista…':loading?'Conferindo seus acessos…':lists.length+' lista(s) disponível(is).'}</p>
    {(lists.length>4||search)&&<label className="vp-list-search">Buscar lista ou responsável<input type="search" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Nome ou comunidade"/></label>}
    {loading&&!lists.length?<p className="vp-list-empty">Conferindo seus acessos…</p>:!lists.length&&!error?<div className="vp-list-empty"><h2>Nenhuma lista compartilhada com você</h2><p>Peça ao responsável para abrir “Compartilhar lista” e liberar o acesso para você.</p><button className={btnSec} onClick={()=>void refresh()}>Já recebi acesso. Atualizar</button></div>:<ul className="vp-access-list" aria-label="Listas de pessoas">{filtered.map(list=><li key={list.id}>
      <span className="vp-list-avatar" aria-hidden="true"><Icon d={list.own?I.users:I.shield}/></span>
      <div className="vp-list-info"><h2>{list.title}</h2><p>{list.own&&list.ownerName?<>{list.ownerName} · </>:null}{list.sharedByName&&list.sharedByName!==list.ownerName?'Acesso compartilhado':'Compartilhada com você'}</p>{!list.own&&list.sharedByName&&list.sharedByName!==list.ownerName&&<p>Compartilhada por {list.sharedByName}</p>}<span className="vp-list-role">{list.own?'Sua lista':list.access==='EDIT'?'Pode consultar e editar':'Somente consulta'}</span></div>
      <a className={btnSec} href={list.href} aria-label={'Abrir '+list.title+' — '+list.communityName} aria-disabled={!!opening} onClick={e=>void open(e,list)}>{opening===list.id?'Abrindo…':'Abrir lista'}<span aria-hidden="true"> →</span></a>
    </li>)}</ul>}
    {!!lists.length&&!filtered.length&&<p className="vp-list-empty">Nenhuma lista encontrada para esta busca.</p>}
    {!!lists.length&&<p className="vp-list-footnote">Cada lista mantém seus próprios cadastros. Abrir uma lista não copia os contatos para a sua.</p>}
  </section>;
}
