'use client';
import {useCallback,useEffect,useMemo,useRef,useState,type ChangeEvent} from 'react';
import {api,person,category,today,type Pessoa,type PerfilConfig} from './data';
import {Pessoas,Aniversarios,Relacionamento,btnPri,btnSec,Confirm,Icon,I} from './Views';
import {PersonForm,PersonDetails,ContactForm} from './PersonForms';
import {Dialog} from './Dialog';
import VisitorLoading from './VisitorLoading';
import {initializePersonalLocal,readPersonalLocal,savePersonalLocal} from './personal-local';
import {addPersonalContact,changePersonalPeople,personalEvent,savePersonalPerson,validatePersonalVisitors,PERSONAL_MAX_BYTES,type PersonalVisitors} from '../../lib/personal-visitors';
import './visitors-page.css';
import './personal-visitors.css';

type Storage={provider:'LOCAL'|'GOOGLE_DRIVE'|null;revision:number;userId:number;communityId:number;googleAvailable:boolean;googleConnected:boolean;googleEmail:string|null;folderUrl:string|null;document?:PersonalVisitors};
const profile:PerfilConfig={papel:'Minha lista pessoal',podeCriarPessoa:true,podeEditarPessoa:true,podeArquivar:true,podeExcluir:true,podeRegistrarContato:true,podeEditarCategorias:false,podeImportarExportar:false};
type Action='arquivar'|'excluir'|'reativar'|'concluir';
export default function PersonalVisitorApp({userId,communityId,userName,communityName,canOpenShared}:{userId:number;communityId:number;userName:string;communityName:string;canOpenShared:boolean}){
  const endpoint=`/api/pilot/visitantes/pessoal?usuario=${userId}&comunidade=${communityId}`;
  const [storage,setStorage]=useState<Storage|null>(null),[doc,setDoc]=useState<PersonalVisitors|null>(null),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
  const [section,setSection]=useState<'pessoas'|'relacionamento'|'aniversarios'>('pessoas'),[settings,setSettings]=useState(false),[showHistory,setShowHistory]=useState(false),[categoryFilter,setCategoryFilter]=useState('');
  const [opened,setOpened]=useState<string|null>(null),[form,setForm]=useState<Pessoa|'new'|null>(null),[contact,setContact]=useState<Pessoa|null>(null),[confirm,setConfirm]=useState<{ids:number[];action:Action}|null>(null),[restore,setRestore]=useState<PersonalVisitors|null>(null);
  const pending=useRef(false),generation=useRef(0),fileInput=useRef<HTMLInputElement>(null);
  const clearPrivate=useCallback(()=>{setDoc(null);setOpened(null);setForm(null);setContact(null);setConfirm(null);setRestore(null);setSettings(false);setShowHistory(false);},[]);
  const refresh=useCallback(async()=>{
    const current=++generation.current;setLoading(true);setError('');
    try{
      const state=await api<Storage>(endpoint);if(current!==generation.current)return;setStorage(state);
      const value=state.provider==='GOOGLE_DRIVE'?(await api<Storage>(endpoint+'&dados=1')).document:state.provider==='LOCAL'?await readPersonalLocal(userId,communityId):null;
      if(current===generation.current){setDoc(value||null);if(value&&state.provider==='LOCAL'&&new URLSearchParams(location.search).get('google')==='connected')setSettings(true);}
    }catch(e){if(current===generation.current){setError((e as Error).message);if([401,403,409].includes((e as Error&{status?:number}).status||0)){clearPrivate();setStorage(null);}}}
    finally{if(current===generation.current)setLoading(false);}
  },[endpoint,userId,communityId,clearPrivate]);
  useEffect(()=>{void refresh();const query=new URLSearchParams(location.search);if(query.get('googleErro'))setNotice(query.get('googleErro')!);else if(query.get('google')==='connected')setNotice('Conta Google conectada.');return()=>{generation.current++;};},[refresh]);
  // Detect a sign-out, account switch or permission revocation in an already open tab.
  useEffect(()=>{const check=()=>{if(document.visibilityState!=='visible'||pending.current)return;void api<Storage>(endpoint).catch(e=>{if([401,403,409].includes(e.status)){clearPrivate();setStorage(null);setError(e.message);}});};const timer=setInterval(check,60000);window.addEventListener('focus',check);return()=>{clearInterval(timer);window.removeEventListener('focus',check);};},[endpoint,clearPrivate]);
  const people=useMemo(()=>doc?.people.map(person)||[],[doc]);
  const categories=useMemo(()=>[...new Set(people.map(p=>p.categoria).filter(Boolean))].map((name,i)=>category({id:i+1,nome:name!})),[people]);
  const active=people.filter(p=>!p.arquivado),selected=people.find(p=>p.id===opened);
  const personalHistory=useMemo(()=>doc?.contacts.filter(c=>String(c.visitante_id)===opened).sort((a,b)=>b.id-a.id)||[],[doc,opened]);
  function notify(message:string,tone?:'info'|'success'|'error'){if(tone==='error')setError(message);else setNotice(message);}
  async function exclusive<T>(work:()=>Promise<T>):Promise<T>{
    if(pending.current)throw new Error('Aguarde a operação atual.');pending.current=true;setBusy(true);setError('');setNotice('');
    try{return await work();}catch(e){setError((e as Error).message);if([401,403].includes((e as Error&{status?:number}).status||0)){clearPrivate();setStorage(null);}throw e;}finally{pending.current=false;setBusy(false);}
  }
  async function choose(provider:'LOCAL'|'GOOGLE_DRIVE'){
    try{await exclusive(async()=>{
      const state=await api<Storage>(endpoint);setStorage(state);
      if(provider==='GOOGLE_DRIVE'&&!state.googleConnected){const auth=await api<{url:string}>(endpoint,'POST',{action:'authorize'});location.assign(auth.url);return;}
      if(provider==='LOCAL'){
        await api(endpoint,'POST',{action:'local'});
        const local=await initializePersonalLocal(userId,communityId);setDoc(local);setStorage({...state,provider:'LOCAL'});setNotice('Pronto! Seus cadastros serão salvos neste aparelho. Use “Novo cadastro” para começar.');
      }else{
        // Moving local data is explicit and sends only this account's document.
        const result=await api<{document:PersonalVisitors}>(endpoint,'POST',{action:'drive',...(doc?{document:doc}:{})});
        setDoc(result.document);setStorage({...state,provider:'GOOGLE_DRIVE',revision:result.document.revision});setNotice('Seu Drive está pronto. Os cadastros foram salvos e conferidos.');setSettings(false);
      }
    });}catch{/* The persistent alert explains how to retry. */}
  }
  async function save(change:(next:PersonalVisitors)=>void,message:string){
    return exclusive(async()=>{
      if(!doc||!storage?.provider)throw new Error('Escolha onde guardar seus cadastros.');
      const current=await api<Storage>(endpoint);
      if(current.provider!==storage.provider)throw new Error('O armazenamento mudou em outra aba. Atualize a página antes de salvar.');
      const next=structuredClone(doc);change(next);validatePersonalVisitors(next,userId,communityId);
      const saved=storage.provider==='LOCAL'?await savePersonalLocal(next,doc.revision):(await api<{document:PersonalVisitors}>(endpoint,'PATCH',{revision:doc.revision,document:next})).document;
      setDoc(saved);setNotice(message.replace(/\.$/,'')+(storage.provider==='LOCAL'?' neste aparelho.':' no seu Drive.'));return true;
    });
  }
  async function bulk(ids:string[],action:'arquivar'|'excluir'){try{return await save(next=>changePersonalPeople(next,ids.map(Number),action),'Alteração concluída.');}catch{return false;}}
  async function exportPending(ids:string[]){
    try{await exclusive(async()=>{
      const XLSX=await import('xlsx'),rows=people.filter(p=>ids.includes(p.id)).map(p=>({Nome:p.nome,Telefone:p.telefone||'',Email:p.email||'',Responsável:p.responsavel||'','Próxima ação':p.proximaAcao||'',Prazo:p.prazo||'','Próximo contato':p.retorno||''}));
      const workbook=XLSX.utils.book_new();XLSX.utils.book_append_sheet(workbook,XLSX.utils.json_to_sheet(rows),'Pendências');XLSX.writeFile(workbook,`minhas-pendencias-${today()}.xlsx`);setNotice(`${rows.length} pendência(s) exportada(s).`);
    });}catch{/* Error is shown in the persistent alert. */}
  }
  function backup(){if(!doc)return;const url=URL.createObjectURL(new Blob([JSON.stringify(doc,null,2)],{type:'application/json'}));const link=document.createElement('a');link.href=url;link.download=`meus-visitantes-${today()}.json`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);setNotice('Backup preparado. Guarde o arquivo em um local seguro.');}
  async function importBackup(e:ChangeEvent<HTMLInputElement>){
    const file=e.target.files?.[0];e.target.value='';if(!file)return;
    try{if(file.size>PERSONAL_MAX_BYTES)throw new Error('O backup excede 4 MB.');const value:unknown=JSON.parse(await file.text());validatePersonalVisitors(value,userId,communityId);setRestore(value);setSettings(false);}catch(e){setError((e as Error).message);}
  }
  const setup=!loading&&storage&&!doc&&storage.provider!=='GOOGLE_DRIVE';
  const events=(doc?.events||[]).filter(e=>Date.parse(e.at)>Date.now()-30*86400000).slice().reverse();
  return <div className="visitor-app vp-personal"><main className="vp-personal-main" aria-label="Meus visitantes" aria-busy={loading||busy}>
    <header className="vp-personal-heading"><div><a href="/painel">← Voltar ao painel</a><h1>Meus visitantes</h1><p>{userName} · {communityName}</p></div><div className="vp-actions">{canOpenShared&&<a className={btnSec} href="/painel/visitantes?lista=compartilhada">Lista compartilhada</a>}<button className={btnSec} disabled={busy||loading} onClick={()=>void refresh()}><Icon d={I.refresh}/>Atualizar</button>{doc&&<button className={btnSec} disabled={busy} onClick={()=>setSettings(true)}><Icon d={I.shield}/>Armazenamento</button>}</div></header>
    {error&&<div role="alert" className="vp-error">{error} <button disabled={busy||loading} onClick={()=>void refresh()}>Tentar novamente</button></div>}
    <div className="vp-personal-notice" role="status" aria-live="polite">{busy?'Salvando… Aguarde a confirmação.':notice}</div>
    {loading?<VisitorLoading/>:setup?<section className="vp-personal-setup" aria-labelledby="personal-storage-title">
      <span className="vp-personal-eyebrow">SUA LISTA PESSOAL</span><h2 id="personal-storage-title">{storage.provider==='LOCAL'?'Comece neste aparelho':'Onde guardar seus cadastros?'}</h2>
      <p>{storage.provider==='LOCAL'?'Não encontramos uma lista neste navegador. Você pode restaurar seu backup ou começar uma lista vazia aqui.':'Escolha uma vez para começar. Esta lista pertence a você e fica separada da lista do administrador.'}</p>
      <div className="vp-personal-choices"><article><Icon d={I.phone}/><h3>Neste aparelho</h3><p>Fica neste celular ou computador. Limpar os dados do navegador pode apagar a lista; mantenha um backup.</p><button className={btnPri} disabled={busy} onClick={()=>void choose('LOCAL')}>{storage.provider==='LOCAL'?'Iniciar lista neste aparelho':'Usar este aparelho'}</button></article>{storage.provider!=='LOCAL'&&<article><Icon d={I.shield}/><h3>No meu Google Drive</h3><p>Acesse seus cadastros em outros aparelhos, usando sua própria conta no Vínkulo.</p>{storage.googleConnected&&<small>Conectado: {storage.googleEmail}</small>}<button className={btnSec} disabled={busy||!storage.googleAvailable} onClick={()=>void choose('GOOGLE_DRIVE')}>{storage.googleConnected?'Usar meu Drive':'Conectar meu Drive'}</button>{!storage.googleAvailable&&<small>Conexão com Google indisponível no momento.</small>}</article>}</div>
      {storage.provider==='LOCAL'&&<button className={btnSec} disabled={busy} onClick={()=>fileInput.current?.click()}>Restaurar meu backup</button>}
    </section>:doc?<>
      <div className="vp-personal-toolbar"><nav aria-label="Áreas da minha lista">{(['pessoas','relacionamento','aniversarios'] as const).map(s=><button key={s} aria-current={section===s?'page':undefined} onClick={()=>setSection(s)}>{{pessoas:'Pessoas',relacionamento:'Relacionamento',aniversarios:'Aniversários'}[s]}</button>)}</nav><span>{storage?.provider==='LOCAL'?'Salvo neste aparelho':'Salvo no meu Drive'}</span><button className={btnSec} onClick={()=>setShowHistory(true)}>Histórico</button></div>
      {section==='pessoas'&&<Pessoas personal menuToggle={null} pessoas={people} categorias={categories} perfil={profile} celulas={[...new Set(people.map(p=>p.celula||'').filter(Boolean))]} onOpen={setOpened} onNew={()=>setForm('new')} onBulk={bulk} notify={notify} categoryFilter={categoryFilter} onCategoryChange={setCategoryFilter}/>}
      {section==='aniversarios'&&<Aniversarios pessoas={active} onOpen={setOpened} notify={notify}/>}
      {section==='relacionamento'&&<Relacionamento pessoas={active} categorias={categories} onOpen={setOpened} notify={notify} onExport={ids=>void exportPending(ids)}/>}
    </>:storage?.provider==='GOOGLE_DRIVE'?<section className="vp-personal-setup"><h2>Abra sua lista no Drive</h2><p>Não foi possível carregar seus cadastros. Tente novamente ou reconecte sua conta Google.</p><button className={btnSec} disabled={busy} onClick={()=>void exclusive(async()=>{const auth=await api<{url:string}>(endpoint,'POST',{action:'authorize'});location.assign(auth.url);}).catch(()=>{})}>Reconectar meu Drive</button></section>:null}
    <input ref={fileInput} type="file" accept=".json,application/json" hidden onChange={e=>void importBackup(e)}/>
    {settings&&doc&&<Dialog title="Armazenamento da minha lista" onClose={()=>{if(!busy)setSettings(false);}}><div className="vp-details"><p>{storage?.provider==='LOCAL'?'Seus cadastros ficam apenas neste navegador. Baixe um backup antes de trocar de aparelho ou limpar seus dados.':'Seus cadastros ficam no seu Google Drive. Você pode acessá-los ao entrar na sua conta em outro aparelho.'}</p><div className="vp-actions"><button className={btnPri} disabled={busy} onClick={backup}>Baixar backup</button>{storage?.provider==='LOCAL'&&<button className={btnSec} disabled={busy} onClick={()=>fileInput.current?.click()}>Restaurar backup</button>}{storage?.provider==='GOOGLE_DRIVE'&&<button className={btnSec} disabled={busy} onClick={()=>void exclusive(async()=>{const auth=await api<{url:string}>(endpoint,'POST',{action:'authorize'});location.assign(auth.url);}).catch(()=>{})}>Reconectar meu Drive</button>}{storage?.folderUrl&&<a className={btnSec} href={storage.folderUrl} target="_blank" rel="noreferrer">Abrir pasta no Drive ↗</a>}</div>{storage?.provider==='LOCAL'&&storage.googleAvailable&&<section><h3>Passar para meu Drive</h3><p>Os {doc.people.length} cadastros desta lista serão copiados e conferidos. A cópia neste aparelho será preservada como backup.</p><button className={btnSec} disabled={busy} onClick={()=>void choose('GOOGLE_DRIVE')}>{storage.googleConnected?'Copiar lista para meu Drive':'Conectar meu Drive'}</button></section>}{notice&&<p role="status">{notice}</p>}{error&&<p role="alert" className="vp-error">{error}</p>}</div></Dialog>}
    {showHistory&&<Dialog title="Histórico da minha lista" onClose={()=>setShowHistory(false)}><p className="vp-muted">Alterações dos últimos 30 dias. Backups e versões antigas no Drive podem manter cópias anteriores.</p>{events.length?<ol className="vp-history">{events.map(e=><li key={e.id}><small>{new Date(e.at).toLocaleString('pt-BR')}</small><strong>{e.message}</strong></li>)}</ol>:<p>Nenhuma alteração nos últimos 30 dias.</p>}</Dialog>}
    {selected&&!form&&!contact&&!confirm&&<PersonDetails person={selected} fields={[]} profile={profile} personalHistory={personalHistory} canViewHistory onClose={()=>setOpened(null)} onEdit={()=>setForm(selected)} onContact={()=>setContact(selected)} onAction={action=>setConfirm({ids:[Number(selected.id)],action})}/>}
    {form&&<PersonForm personal person={form==='new'?undefined:form} categories={[]} cells={[]} fields={[]} onClose={()=>{if(!busy)setForm(null);}} onSave={async body=>{const ok=await save(next=>{savePersonalPerson(next,body,form==='new'?undefined:Number(form.id));},'Cadastro salvo.');setForm(null);setOpened(null);return ok;}}/>}
    {contact&&<ContactForm person={contact} onClose={()=>{if(!busy)setContact(null);}} onSave={async body=>{const ok=await save(next=>addPersonalContact(next,body,userName),'Contato registrado.');setContact(null);setOpened(null);return ok;}}/>}
    {confirm&&<Confirm title={`${{arquivar:'Arquivar ficha',excluir:'Excluir ficha',reativar:'Reativar ficha',concluir:'Concluir próxima ação'}[confirm.action]}?`} body={confirm.action==='excluir'?'A ficha e seus contatos serão removidos desta lista. Backups já baixados e versões anteriores no Drive continuarão existindo.':confirm.action==='arquivar'?'A ficha sairá da lista ativa. Você poderá encontrá-la no filtro Arquivados.':'A alteração será aplicada somente à sua lista pessoal.'} action={busy?'Aguarde…':'Confirmar'} danger={confirm.action==='excluir'} onCancel={()=>{if(!busy)setConfirm(null);}} onConfirm={async()=>{try{await save(next=>changePersonalPeople(next,confirm.ids,confirm.action),'Alteração concluída.');setConfirm(null);setOpened(null);}catch{setConfirm(null);}}}/>}
    {restore&&<Confirm title="Restaurar minha lista?" body={`O backup tem ${restore.people.length} cadastros. Ele substituirá a lista deste aparelho${doc?` (${doc.people.length} cadastros)`:''}. Baixe um backup da lista atual antes de continuar.`} action={busy?'Aguarde…':'Restaurar backup'} danger onCancel={()=>{if(!busy)setRestore(null);}} onConfirm={async()=>{try{await exclusive(async()=>{const state=await api<Storage>(endpoint);if(state.provider!=='LOCAL')throw new Error('O armazenamento mudou. Atualize a página.');const next=structuredClone(restore);personalEvent(next,'Backup restaurado.');const saved=await savePersonalLocal(next,doc?.revision??null);setDoc(saved);setNotice('Backup restaurado neste aparelho.');setRestore(null);});}catch{setRestore(null);}}}/>}
  </main></div>;
}
