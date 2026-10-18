"use client";
import {lazy,Suspense,useCallback,useEffect,useRef,useState} from 'react';
import Link from '../StableLink';
import VisitorLoading from './VisitorLoading';
import {Pessoas,Relacionamento,Aniversarios,Header,Icon,I,btnPri,btnSec,Confirm} from './Views';
import {api,person,category,today,type Pessoa,type Categoria,type Named,type Raw,type PerfilConfig} from './data';
import {PersonDetails,PersonForm,ContactForm} from './PersonForms';
const Categories=lazy(()=>import('./Categories'));
const CareNotesBoard=lazy(()=>import('../CareNotesBoard'));
const VisitorSpreadsheetImport=lazy(()=>import('../VisitorSpreadsheetImport'));
const VisitorSheetSettings=lazy(()=>import('../VisitorSheetSettings').then(m=>({default:m.VisitorSheetSettings})));
import {visitorExportWorksheet,type VisitorCustomField} from '../../lib/visitor-spreadsheet';
import './visitors-page.css';

type Section='pessoas'|'relacionamento'|'aniversarios'|'categorias'|'anotacoes'|'planilha';
const sections:{id:Section;label:string;icon:string}[]=[{id:'pessoas',label:'Pessoas',icon:I.users},{id:'relacionamento',label:'Relacionamento',icon:I.bell},{id:'aniversarios',label:'Aniversários',icon:I.cake},{id:'categorias',label:'Categorias',icon:I.tag},{id:'anotacoes',label:'Anotações',icon:I.note},{id:'planilha',label:'Importar / Exportar',icon:I.sheet}];
type Snapshot={people:Pessoa[];categories:Categoria[];cells:Named[];responsibles:Named[];ministries:Named[];fields:VisitorCustomField[]};
export default function VisitorApp({communityName,userName,permissions,isOwner}:{communityName:string;userName:string;permissions:string[];isOwner:boolean}) {
  const [data,setData]=useState<Snapshot|null>(null),[section,setSection]=useState<Section>('pessoas'),[menu,setMenu]=useState(false),[error,setError]=useState(''),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[toast,setToast]=useState('');
  const [opened,setOpened]=useState<string|null>(null),[form,setForm]=useState<Pessoa|'new'|null>(null),[contact,setContact]=useState<Pessoa|null>(null),[confirm,setConfirm]=useState<{p:Pessoa;action:'arquivar'|'excluir'|'reativar'|'concluir'}|null>(null);
  const [refreshing,setRefreshing]=useState(false);
  const requestId=useRef(0),mutation=useRef(false),toastTimer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined);
  const allowed=(p:string)=>permissions.includes(p);
  const profile:PerfilConfig={papel:isOwner?'Administrador':'Equipe autorizada',podeCriarPessoa:allowed('visitors.create'),podeEditarPessoa:allowed('visitors.edit'),podeArquivar:allowed('visitors.deactivate'),podeExcluir:allowed('visitors.deactivate'),podeRegistrarContato:allowed('followups.manage'),podeEditarCategorias:isOwner||allowed('visitor.categories.manage'),podeImportarExportar:allowed('visitors.create')};
  function notify(message:string,tone?:'info'|'success'|'error') {if(tone==='error'){setError(message);return;}setToast(message);clearTimeout(toastTimer.current);toastTimer.current=setTimeout(()=>setToast(''),5000);}
  const load=useCallback(async(silent=false)=>{
    const id=++requestId.current;
    if(!silent)setRefreshing(true);
    try {
      const v=await api<{visitantes:Raw[];celulas:Named[];categorias:Raw[];responsaveis:Named[];ministerios:Named[];campos:VisitorCustomField[]}>('/api/pilot/visitantes/pagina');
      if(id===requestId.current){setData({people:v.visitantes.map(person),cells:v.celulas,categories:v.categorias.map(category),responsibles:v.responsaveis,ministries:v.ministerios,fields:v.campos});setError('');}
    }catch(e){if(id===requestId.current)setError((e as Error).message);}finally{if(id===requestId.current){setLoading(false);setRefreshing(false);}}
  },[]);
  useEffect(()=>{void load();return()=>{requestId.current++;clearTimeout(toastTimer.current);};},[load]);
  useEffect(()=>{const sync=()=>{const q=new URLSearchParams(location.search);const v=q.get('section')||q.get('aba');setSection(q.has('sheetSetup')?'planilha':sections.some(s=>s.id===v)?v as Section:q.has('anotacao')?'anotacoes':'pessoas');const id=q.get('visitante')||q.get('id');if(id&&/^\d+$/.test(id))setOpened(id);if(q.get('novo')==='1'&&permissions.includes('visitors.create'))setForm('new');};sync();window.addEventListener('popstate',sync);return()=>window.removeEventListener('popstate',sync);},[]);
  useEffect(()=>{const timer=setInterval(()=>{if(document.visibilityState==='visible'&&!mutation.current&&!form&&!opened&&!contact&&!confirm)void load(true);},60000);return()=>clearInterval(timer);},[load,form,opened,contact,confirm]);
  function navigate(s:Section) {setSection(s);setMenu(false);const u=new URL(location.href);u.searchParams.set('section',s);u.hash='';history.pushState(null,'',u);}
  async function mutate(work:()=>Promise<void>,message:string) {
    if(mutation.current)return false;mutation.current=true;setBusy(true);setError('');
    try{await work();await load();notify(message,'success');return true;}finally{mutation.current=false;setBusy(false);}
  }
  async function bulk(ids:string[],action:'arquivar'|'excluir') {
    let count=0;
    try{return await mutate(async()=>{for(const id of ids){await api(`/api/pilot/visitantes/${id}${action==='excluir'?'?permanente=1':''}`,'DELETE');count++;}},`${count||ids.length} ficha(s) ${action==='excluir'?'excluída(s)':'arquivada(s)'}.`);}
    catch(e){await load();setError(`${count?`${count} ficha(s) processada(s). `:''}${(e as Error).message}`);return false;}
  }
  async function exportFile(format:'xlsx'|'csv',ids?:string[]) {
    if(mutation.current)return;mutation.current=true;setBusy(true);setError('');
    try {const r=await api<{rows:Record<string,string|number>[];campos:VisitorCustomField[];headers:string[]}>('/api/pilot/visitantes/exportar');const rows=ids?r.rows.filter(row=>ids.includes(String(row.ID))):r.rows;const XLSX=await import('xlsx');const ws=visitorExportWorksheet(XLSX,rows,r.campos,r.headers);const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,'Pessoas');XLSX.writeFile(wb,`vinkulo-visitantes-${today()}.${format}`,{bookType:format});notify(`${rows.length} ficha(s) exportada(s).`);}catch(e){setError((e as Error).message);}finally{mutation.current=false;setBusy(false);}
  }
  const openedPerson=data?.people.find(p=>p.id===opened),active=data?.people.filter(p=>!p.arquivado)||[];
  return <div className="visitor-app">
    <header className="vp-mobile-header"><button aria-label="Abrir menu de Visitantes" aria-expanded={menu} onClick={()=>setMenu(!menu)}><Icon d={I.menu}/></button><Link href="/painel" showLoading loadingLabel="Voltando ao painel…">Vínkulo</Link><span>Visitantes</span></header>
    {menu&&<button className="vp-nav-backdrop" aria-label="Fechar menu" onClick={()=>setMenu(false)}/>}
    <aside className={`vp-sidebar ${menu?'is-open':''}`}><a className="vp-brand" href="/painel"><span>V</span><div><strong>Vínkulo</strong><small>Visitantes</small></div></a><p className="vp-community">{communityName}</p><nav aria-label="Áreas de Visitantes">{sections.filter(s=>s.id!=='anotacoes'||allowed('dashboard.view')).map(s=><button key={s.id} aria-current={section===s.id?'page':undefined} onClick={()=>navigate(s.id)}><Icon d={s.icon}/>{s.label}{s.id==='pessoas'&&data&&<span>{active.length}</span>}</button>)}</nav><a className="vp-back" href="/painel">← Voltar ao painel</a><footer><span className="vp-avatar">{userName.slice(0,1)}</span><div><strong>{userName}</strong><small>{profile.papel}</small></div></footer></aside>
    <main className="vp-main" aria-label="Gestão de visitantes" aria-busy={loading||busy}>
      <div className="vp-context"><Link className="vp-back-top" href="/painel" showLoading loadingLabel="Voltando ao painel…"><span aria-hidden="true">←</span> Voltar ao painel</Link><span>{communityName}</span><button disabled={loading||refreshing||busy} onClick={()=>void load()}><span className={refreshing?'vp-spinning':''}><Icon d={I.refresh}/></span>{refreshing?'Atualizando…':'Atualizar'}</button><Link href="/painel?view=avisos" showLoading loadingLabel="Abrindo notificações…" aria-label="Abrir notificações"><Icon d={I.bell}/></Link></div>
      {error&&<div role="alert" className="vp-error vp-page-error">{error}<button onClick={()=>void load()}>Tentar novamente</button></div>}
      <Suspense fallback={<VisitorLoading/>}>{loading?<VisitorLoading/>:data?<>
        {section==='pessoas'&&<Pessoas pessoas={data.people} categorias={data.categories} perfil={profile} celulas={data.cells.map(c=>c.nome)} onOpen={setOpened} onNew={()=>setForm('new')} onBulk={bulk} notify={notify} onGoToImport={()=>navigate('planilha')}/>}
        {section==='relacionamento'&&<Relacionamento pessoas={active} categorias={data.categories} onOpen={setOpened} notify={notify} onExport={ids=>void exportFile('csv',ids)}/>}
        {section==='aniversarios'&&<Aniversarios pessoas={active} onOpen={setOpened} notify={notify}/>}
        {section==='categorias'&&<Categories categories={data.categories} people={data.people} responsibles={data.responsibles} ministries={data.ministries} canManage={profile.podeEditarCategorias} onChanged={load}/>}
        {section==='anotacoes'&&allowed('dashboard.view')&&<><Header title="Anotações" sub="Lembretes e próximos cuidados, privados para você"/><div className="vp-scroll"><CareNotesBoard/></div></>}
        {section==='planilha'&&<><Header title="Importar / Exportar" sub="Cadastros completos, com cada campo em sua própria coluna"/><div className="vp-scroll vp-integrations"><section><h2>Importar cadastros</h2><p>Escolha uma planilha Excel ou CSV. Revise as colunas, as categorias e as datas antes de salvar. Colunas sem equivalente podem se tornar novos campos.</p>{profile.podeCriarPessoa?<VisitorSpreadsheetImport categories={data.categories} cells={data.cells} canManageCategories={profile.podeEditarCategorias} onImported={async message=>{await load();notify(message);}}/>:<p className="vp-muted">Seu acesso permite consultar e exportar. A importação exige permissão de cadastro.</p>}</section><section><h2>Exportar fichas</h2><p>Inclui todas as fichas da comunidade, ativas e arquivadas, e os campos adicionais.</p><div className="vp-actions"><button className={btnPri} disabled={busy} onClick={()=>void exportFile('xlsx')}>↓ Exportar Excel</button><button className={btnSec} disabled={busy} onClick={()=>void exportFile('csv')}>Exportar CSV</button></div></section><VisitorSheetSettings canManage={profile.podeEditarCategorias}/></div></>}
      </>:<div className="vp-empty">Não foi possível carregar os cadastros. Use “Tentar novamente”.</div>}</Suspense>
    </main>
    {toast&&<div className="vp-toast" role="status">✓ {toast}</div>}
    {busy&&<div className="vp-saving" role="status">Salvando alterações…</div>}
    {openedPerson&&!form&&!contact&&!confirm&&data&&<PersonDetails key={openedPerson.id} person={openedPerson} fields={data.fields} profile={profile} canViewHistory={allowed('followups.view')} onClose={()=>setOpened(null)} onEdit={()=>setForm(openedPerson)} onContact={()=>setContact(openedPerson)} onAction={action=>setConfirm({p:openedPerson,action})}/>}
    {form&&data&&<PersonForm person={form==='new'?undefined:form} categories={data.categories} cells={data.cells} fields={data.fields} onClose={()=>setForm(null)} onSave={async body=>{
      return mutate(async()=>{const r=await api<{id?:number}>(`/api/pilot/visitantes${form==='new'?'':`/${form.id}`}`,form==='new'?'POST':'PATCH',body);setOpened(form==='new'?String(r.id):form.id);setForm(null);},'Cadastro salvo.');
    }}/>}
    {contact&&<ContactForm person={contact} onClose={()=>setContact(null)} onSave={async body=>mutate(async()=>{await api('/api/pilot/acompanhamentos','POST',body);setContact(null);},'Contato registrado.')}/>}
    {confirm&&<Confirm title={`${{arquivar:'Arquivar ficha',excluir:'Excluir definitivamente',reativar:'Reativar ficha',concluir:'Concluir próxima ação'}[confirm.action]}?`} body={confirm.action==='excluir'?`A ficha de ${confirm.p.nome} e seu histórico serão excluídos permanentemente.`:confirm.action==='arquivar'?`${confirm.p.nome} sairá da lista ativa. A ficha e o histórico serão preservados.`:confirm.action==='reativar'?'A ficha voltará à lista ativa, em acompanhamento.':'A próxima ação e seu prazo serão removidos. O histórico de contatos será preservado.'} action={busy?'Aguarde…':'Confirmar'} danger={confirm.action==='excluir'} onCancel={()=>{if(!busy)setConfirm(null);}} onConfirm={async()=>{
      try{await mutate(async()=>{const {p,action}=confirm;await api(`/api/pilot/visitantes/${p.id}${action==='excluir'?'?permanente=1':''}`,action==='arquivar'||action==='excluir'?'DELETE':'PATCH',action==='reativar'?{reativar:true}:action==='concluir'?{proximaAcao:'',dataProximaAcao:''}:undefined);if(action==='excluir'||action==='arquivar')setOpened(null);setConfirm(null);},'Alteração concluída.');}catch(e){setConfirm(null);setError((e as Error).message);}
    }}/>}
  </div>;
}
