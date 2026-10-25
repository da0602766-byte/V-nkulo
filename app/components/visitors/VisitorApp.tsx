"use client";
import VinkuloMark from "../VinkuloMark";
import {lazy,Suspense,useCallback,useEffect,useRef,useState} from 'react';
import Link from '../StableLink';
import VisitorLoading from './VisitorLoading';
import {useVisitorPreference} from './WorkspaceControls';
import VisitorNotices from './VisitorNotices';
import {Pessoas,Relacionamento,Aniversarios,Header,Icon,I,btnPri,btnSec,Confirm} from './Views';
import {api,person,category,today,type Pessoa,type Categoria,type Named,type Raw,type PerfilConfig} from './data';
import {PersonDetails,PersonForm,ContactForm} from './PersonForms';
const Categories=lazy(()=>import('./Categories'));
const CareNotesBoard=lazy(()=>import('../CareNotesBoard'));
const VisitorSpreadsheetImport=lazy(()=>import('../VisitorSpreadsheetImport'));
const VisitorSheetSettings=lazy(()=>import('../VisitorSheetSettings').then(m=>({default:m.VisitorSheetSettings})));
const VisitorSharing=lazy(()=>import('./VisitorSharing'));
const VisitorDriveSettings=lazy(()=>import('./VisitorDriveSettings'));
import {visitorExportWorksheet,type VisitorCustomField} from '../../lib/visitor-spreadsheet';
import './visitors-page.css';

type Section='pessoas'|'relacionamento'|'aniversarios'|'categorias'|'anotacoes'|'planilha'|'armazenamento'|'compartilhar';
const sections:{id:Section;label:string;icon:string}[]=[{id:'pessoas',label:'Pessoas',icon:I.users},{id:'relacionamento',label:'Relacionamento',icon:I.bell},{id:'aniversarios',label:'Aniversários',icon:I.cake},{id:'categorias',label:'Categorias',icon:I.tag},{id:'anotacoes',label:'Anotações',icon:I.note},{id:'planilha',label:'Importar / Exportar',icon:I.sheet},{id:'compartilhar',label:'Compartilhar lista',icon:I.users},{id:'armazenamento',label:'Armazenamento e acessos',icon:I.sheet}];
type Snapshot={people:Pessoa[];categories:Categoria[];cells:Named[];responsibles:Named[];ministries:Named[];fields:VisitorCustomField[]};
export default function VisitorApp({communityName,userName,permissions,isOwner,personalListLink=false}:{communityName:string;userName:string;permissions:string[];isOwner:boolean;personalListLink?:boolean}) {
  const [data,setData]=useState<Snapshot|null>(null),[section,setSection]=useState<Section>('pessoas'),[menu,setMenu]=useState(false),[error,setError]=useState(''),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[toast,setToast]=useState('');
  const [opened,setOpened]=useState<string|null>(null),[form,setForm]=useState<Pessoa|'new'|null>(null),[contact,setContact]=useState<Pessoa|null>(null),[confirm,setConfirm]=useState<{p:Pessoa;action:'arquivar'|'excluir'|'reativar'|'concluir'}|null>(null);
  const [refreshing,setRefreshing]=useState(false),[driveState,setDriveState]=useState(''),[operation,setOperation]=useState('Salvando alterações…');
  const [selectedCategory,setSelectedCategory]=useState('');
  const [sidebarCollapsed,setSidebarCollapsed]=useVisitorPreference('menu');
  const [categoriesExpanded,setCategoriesExpanded]=useState(true);
  const requestId=useRef(0),mutation=useRef(false),toastTimer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined);
  const [effectivePermissions,setEffectivePermissions]=useState(permissions);
  const allowed=(p:string)=>effectivePermissions.includes(p);
  const profile:PerfilConfig={papel:isOwner?'Administrador':'Equipe autorizada',podeCriarPessoa:allowed('visitors.create'),podeEditarPessoa:allowed('visitors.edit'),podeArquivar:allowed('visitors.deactivate'),podeExcluir:allowed('visitors.deactivate'),podeRegistrarContato:allowed('followups.manage'),podeEditarCategorias:allowed('visitor.categories.manage'),podeImportarExportar:allowed('visitors.create')};
  function notify(message:string,tone?:'info'|'success'|'error') {if(tone==='error'){setError(message);return;}setToast(message);clearTimeout(toastTimer.current);toastTimer.current=setTimeout(()=>setToast(''),5000);}
  const fetchData=useCallback(()=>{
    const id=++requestId.current;
    return api<{permissions?:string[];visitantes:Raw[];celulas:Named[];categorias:Raw[];responsaveis:Named[];ministerios:Named[];campos:VisitorCustomField[]}>('/api/pilot/visitantes/pagina').then(v=>{
      if(id===requestId.current&&v.permissions)setEffectivePermissions(v.permissions);
      if(id===requestId.current){setData({people:v.visitantes.map(person),cells:v.celulas,categories:v.categorias.map(category),responsibles:v.responsaveis,ministries:v.ministerios,fields:v.campos});setError('');}
    }).catch(e=>{if(id===requestId.current){setError((e as Error).message);if([401,403].includes((e as Error&{status?:number}).status||0)){setData(null);setOpened(null);setForm(null);setContact(null);setConfirm(null);}}}).finally(()=>{if(id===requestId.current){setLoading(false);setRefreshing(false);}});
  },[]);
  const load=useCallback((silent=false)=>{if(!silent)setRefreshing(true);return fetchData();},[fetchData]);
  useEffect(()=>{const controller=new AbortController();fetch('/api/pilot/visitantes/armazenamento',{cache:'no-store',signal:controller.signal}).then(r=>r.ok?r.json():null).then(v=>{if(v)setDriveState(v.state);}).catch(()=>undefined);return()=>controller.abort();},[section]);
  useEffect(()=>{void fetchData();return()=>{requestId.current++;clearTimeout(toastTimer.current);};},[fetchData]);
  useEffect(()=>{const sync=()=>{const q=new URLSearchParams(location.search);const v=q.get('section')||q.get('aba');setSelectedCategory(q.get('categoria')||'');setSection(q.has('sheetSetup')?'planilha':sections.some(s=>s.id===v)?v as Section:q.has('anotacao')?'anotacoes':'pessoas');const id=q.get('visitante')||q.get('id');if(id&&/^\d+$/.test(id))setOpened(id);if(q.get('novo')==='1'&&permissions.includes('visitors.create'))setForm('new');};sync();window.addEventListener('popstate',sync);return()=>window.removeEventListener('popstate',sync);},[]);
  useEffect(()=>{const timer=setInterval(()=>{if(document.visibilityState==='visible'&&!mutation.current)void load(true);},60000);return()=>clearInterval(timer);},[load,form,opened,contact,confirm]);
  function navigate(s:Section) {setSection(s);setMenu(false);const u=new URL(location.href);u.searchParams.set('section',s);u.hash='';history.pushState(null,'',u);}
  function chooseCategory(value:string) {setSelectedCategory(value);setSection('pessoas');setMenu(false);const u=new URL(location.href);u.searchParams.set('section','pessoas');if(value)u.searchParams.set('categoria',value);else u.searchParams.delete('categoria');history.pushState(null,'',u);}
  async function mutate(work:()=>Promise<void>,message:string) {
    setOperation('Salvando alterações…');
    if(mutation.current)return false;mutation.current=true;setBusy(true);setError('');
    try{await work();await load();notify(message,'success');return true;}finally{mutation.current=false;setBusy(false);}
  }
  async function bulk(ids:string[],action:'arquivar'|'excluir') {
    let count=0;
    try{return await mutate(async()=>{for(const id of ids){await api(`/api/pilot/visitantes/${id}${action==='excluir'?'?permanente=1':''}`,'DELETE');count++;}},`${count||ids.length} ficha(s) ${action==='excluir'?'excluída(s)':'arquivada(s)'}.`);}
    catch(e){await load();setError(`${count?`${count} ficha(s) processada(s). `:''}${(e as Error).message}`);return false;}
  }
  async function exportFile(format:'xlsx'|'csv',ids?:string[]) {
    setOperation('Preparando o download…');
    if(mutation.current)return;mutation.current=true;setBusy(true);setError('');
    try {const r=await api<{rows:Record<string,string|number>[];campos:VisitorCustomField[];headers:string[]}>('/api/pilot/visitantes/exportar');const rows=ids?r.rows.filter(row=>ids.includes(String(row.ID))):r.rows;const XLSX=await import('xlsx');const ws=visitorExportWorksheet(XLSX,rows,r.campos,r.headers);const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,'Pessoas');XLSX.writeFile(wb,`vinkulo-visitantes-${today()}.${format}`,{bookType:format});notify(`${rows.length} ficha(s) exportada(s).`);}catch(e){setError((e as Error).message);}finally{mutation.current=false;setBusy(false);}
  }
  const openedPerson=data?.people.find(p=>p.id===opened),active=data?.people.filter(p=>!p.arquivado)||[];
  const menuToggle=<button className="vp-menu-toggle" title={sidebarCollapsed?'Expandir menu lateral':'Recolher menu lateral'} aria-label={sidebarCollapsed?'Expandir menu lateral':'Recolher menu lateral'} aria-expanded={!sidebarCollapsed} aria-controls="vp-main-sidebar" onClick={()=>setSidebarCollapsed(!sidebarCollapsed)}><Icon d={I.menu}/></button>;
  return <div className={`visitor-app ${sidebarCollapsed?'vp-menu-collapsed':''}`}>
    <header className="vp-mobile-header"><button aria-label="Abrir menu de Visitantes" aria-expanded={menu} onClick={()=>setMenu(!menu)}><Icon d={I.menu}/></button><Link href="/painel" showLoading loadingLabel="Voltando ao painel…"><VinkuloMark size={32}/>Vínkulo</Link><span>Visitantes</span></header>
    {menu&&<button className="vp-nav-backdrop" aria-label="Fechar menu" onClick={()=>setMenu(false)}/>}

    <aside id="vp-main-sidebar" className={`vp-sidebar ${menu?'is-open':''}`}><a className="vp-brand" href="/painel"><VinkuloMark size={43}/><div><strong>Vínkulo</strong><small>Visitantes</small></div></a><p className="vp-community">{communityName}</p><nav aria-label="Áreas de Visitantes">{sections.filter(s=>!['planilha','armazenamento'].includes(s.id)&&(s.id!=='anotacoes'||allowed('dashboard.view'))).map(s=><button key={s.id} aria-current={section===s.id&&(s.id!=='pessoas'||!selectedCategory)?'page':undefined} onClick={()=>s.id==='pessoas'?chooseCategory(''):navigate(s.id)}><Icon d={s.icon}/>{s.label}{s.id==='pessoas'&&data&&<span>{active.length}</span>}</button>)}{data&&<div className="vp-category-nav" aria-label="Pessoas por categoria"><button type="button" className="vp-category-toggle" aria-expanded={categoriesExpanded} aria-controls="vp-category-links" onClick={()=>setCategoriesExpanded(v=>!v)}><b>Categorias · pessoas ativas</b><Icon d={categoriesExpanded?I.chevronDown:I.chevronRight}/></button><div id="vp-category-links" className="vp-category-links" hidden={!categoriesExpanded}>{data.categories.map(c=><button key={c.id} aria-current={section==='pessoas'&&selectedCategory===c.nome?'page':undefined} onClick={()=>chooseCategory(c.nome)}><Icon d={I.tag}/><b>{c.nome}</b><span>{active.filter(p=>p.categoria===c.nome).length}</span></button>)}<button aria-current={section==='pessoas'&&selectedCategory==='__sem'?'page':undefined} onClick={()=>chooseCategory('__sem')}><Icon d={I.tag}/><b>Sem categoria</b><span>{active.filter(p=>!p.categoria).length}</span></button></div></div>}<button type="button" onClick={()=>{setMenu(false);requestAnimationFrame(()=>window.dispatchEvent(new CustomEvent("vinkulo:open-help")));}}><Icon d="M12 17h.01M9.1 9a3 3 0 0 1 5.8 1c0 2-3 2-3 4M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0"/>Ajuda</button><Link className="vp-back" href="/painel" showLoading loadingLabel="Voltando ao painel…"><span aria-hidden="true">←</span> Voltar ao painel</Link></nav><footer><span className="vp-avatar">{userName.slice(0,1)}</span><div><strong>{userName}</strong><small>{profile.papel}</small></div></footer></aside>
    <main className="vp-main" aria-label="Gestão de visitantes" aria-busy={loading||busy}>
      {personalListLink&&<nav className="vp-personal-switch" aria-label="Lista atual"><strong>Lista compartilhada</strong><a href="/painel/visitantes?lista=pessoal">Abrir minha lista pessoal</a></nav>}
      <div className={`vp-context ${section==='pessoas'?'vp-context-people':''}`}>{menuToggle}<span>{communityName}</span><button disabled={loading||refreshing||busy} onClick={()=>void load()}><span className={refreshing?'vp-spinning':''}><Icon d={I.refresh}/></span>{refreshing?'Atualizando…':'Atualizar'}</button><button className="vp-tool" title="Importar / Exportar" aria-label="Importar / Exportar" aria-pressed={section==='planilha'} onClick={()=>navigate('planilha')}><Icon d={I.sheet}/></button><button className="vp-tool" title={driveState==='REVIEW'?'Armazenamento e acessos: migração aguardando ativação':'Armazenamento e acessos'} aria-label="Armazenamento e acessos" aria-pressed={section==='armazenamento'} onClick={()=>navigate('armazenamento')}><Icon d={I.shield}/>{driveState==='REVIEW'&&<i aria-label="Ativação pendente"/>}</button>{data&&<VisitorNotices people={data.people} categories={data.categories} canViewFollowups={allowed('followups.view')} canViewNotes={allowed('dashboard.view')} onOpen={setOpened} onNote={id=>{navigate('anotacoes');const u=new URL(location.href);u.searchParams.set('anotacao',id);history.replaceState(null,'',u);}}/>}</div>
      {error&&<div role="alert" className="vp-error vp-page-error">{error}<button onClick={()=>void load()}>Tentar novamente</button></div>}
      <Suspense fallback={<VisitorLoading/>}>{section==='compartilhar'?<><Header title="Compartilhar lista" sub="Acesso aos contatos para membros da comunidade"/><VisitorSharing onNavigate={navigate}/></>:section==='armazenamento'?<><Header title="Armazenamento e acessos" sub="Google Drive da comunidade e backup no dispositivo"/><VisitorDriveSettings onChanged={state=>{setDriveState(state);void load();}}/></>:loading?<VisitorLoading/>:data?<>
        {section==='pessoas'&&<Pessoas menuToggle={menuToggle} key={selectedCategory} categoryFilter={selectedCategory} onCategoryChange={chooseCategory} pessoas={data.people} categorias={data.categories} perfil={profile} celulas={data.cells.map(c=>c.nome)} onOpen={setOpened} onNew={()=>setForm('new')} onShare={()=>navigate('compartilhar')} onBulk={bulk} notify={notify}/>}
        {section==='relacionamento'&&<Relacionamento pessoas={active} categorias={data.categories} onOpen={setOpened} notify={notify} onExport={ids=>void exportFile('csv',ids)}/>}
        {section==='aniversarios'&&<Aniversarios pessoas={active} onOpen={setOpened} notify={notify}/>}
        {section==='categorias'&&<Categories categories={data.categories} people={data.people} responsibles={data.responsibles} ministries={data.ministries} canManage={profile.podeEditarCategorias} onChanged={load}/>}
        {section==='anotacoes'&&allowed('dashboard.view')&&<><Header title="Anotações" sub="Lembretes e próximos cuidados, privados para você"/><div className="vp-scroll"><CareNotesBoard editorDialog/></div></>}
        {section==='planilha'&&<><Header title="Importar / Exportar" sub="Cadastros completos, com cada campo em sua própria coluna"/><div className="vp-scroll vp-integrations"><section><h2>Importar cadastros</h2><p>Escolha uma planilha Excel ou CSV. Revise as colunas, as categorias e as datas antes de salvar. Colunas sem equivalente podem se tornar novos campos.</p>{profile.podeCriarPessoa?<VisitorSpreadsheetImport categories={data.categories} cells={data.cells} canManageCategories={profile.podeEditarCategorias} onImported={async message=>{await load();notify(message);}}/>:<p className="vp-muted">Seu acesso permite consultar e exportar. A importação exige permissão de cadastro.</p>}</section><section><h2>Exportar fichas</h2><p>Inclui todas as fichas da comunidade, ativas e arquivadas, e os campos adicionais.</p><div className="vp-actions"><button className={btnPri} disabled={busy} onClick={()=>void exportFile('xlsx')}>↓ Exportar Excel</button><button className={btnSec} disabled={busy} onClick={()=>void exportFile('csv')}>Exportar CSV</button></div></section>{(!driveState||driveState==='LEGACY')&&<VisitorSheetSettings canManage={profile.podeEditarCategorias}/>}</div></>}
      </>:<div className="vp-empty">Não foi possível carregar os cadastros. Use “Tentar novamente”.</div>}</Suspense>
    </main>
    {toast&&<div className="vp-toast" role="status">✓ {toast}</div>}
    {busy&&<div className="vp-saving" role="status"><span className="vp-spinner" aria-hidden="true"/>{operation}</div>}
    {openedPerson&&!form&&!contact&&!confirm&&data&&<PersonDetails key={openedPerson.id} person={openedPerson} fields={data.fields} profile={profile} canViewHistory={allowed('followups.view')} onClose={()=>setOpened(null)} onEdit={()=>setForm(openedPerson)} onContact={()=>setContact(openedPerson)} onAction={action=>setConfirm({p:openedPerson,action})}/>}
    {form&&data&&<PersonForm person={form==='new'?undefined:form} categories={data.categories} cells={data.cells} fields={data.fields} onClose={()=>setForm(null)} onSave={async body=>{
      return mutate(async()=>{const r=await api<{id?:number}>(`/api/pilot/visitantes${form==='new'?'':`/${form.id}`}`,form==='new'?'POST':'PATCH',body);setOpened(form==='new'?String(r.id):form.id);setForm(null);},'Cadastro salvo.');
    }}/>}
    {contact&&<ContactForm person={contact} onClose={()=>setContact(null)} onSave={async body=>mutate(async()=>{await api('/api/pilot/acompanhamentos','POST',body);setContact(null);},'Contato registrado.')}/>}
    {confirm&&<Confirm title={`${{arquivar:'Arquivar ficha',excluir:'Excluir definitivamente',reativar:'Reativar ficha',concluir:'Concluir próxima ação'}[confirm.action]}?`} body={confirm.action==='excluir'?(driveState==='ACTIVE'?`A ficha de ${confirm.p.nome} e seu histórico serão removidos da versão atual. Cópias e versões anteriores no Drive continuarão existindo.`:`A ficha de ${confirm.p.nome} e seu histórico serão excluídos permanentemente.`):confirm.action==='arquivar'?`${confirm.p.nome} sairá da lista ativa. A ficha e o histórico serão preservados.`:confirm.action==='reativar'?'A ficha voltará à lista ativa, em acompanhamento.':'A próxima ação e seu prazo serão removidos. O histórico de contatos será preservado.'} action={busy?'Aguarde…':'Confirmar'} danger={confirm.action==='excluir'} onCancel={()=>{if(!busy)setConfirm(null);}} onConfirm={async()=>{
      try{await mutate(async()=>{const {p,action}=confirm;await api(`/api/pilot/visitantes/${p.id}${action==='excluir'?'?permanente=1':''}`,action==='arquivar'||action==='excluir'?'DELETE':'PATCH',action==='reativar'?{reativar:true}:action==='concluir'?{proximaAcao:'',dataProximaAcao:''}:undefined);if(action==='excluir'||action==='arquivar')setOpened(null);setConfirm(null);},'Alteração concluída.');}catch(e){setConfirm(null);setError((e as Error).message);}
    }}/>}
  </div>;
}
