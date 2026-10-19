"use client";
import {useCallback,useEffect,useState} from "react";
import Link from "./StableLink";
import VinkuloMark from "./VinkuloMark";
import LabModuleForm from "./LabModuleForm";
import type {ModuleDefinition,ModuleRecord} from "../lib/lab-modules";
import "./LabStudio.css";
type Data={definition:ModuleDefinition;version:number;community:string;canWrite:boolean;records:ModuleRecord[];total:number;page:number};
export default function LabModuleRuntime({id}:{id:string}){
 const [data,setData]=useState<Data|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[page,setPage]=useState(0),[archived,setArchived]=useState(false),[search,setSearch]=useState(''),[editing,setEditing]=useState<ModuleRecord|null|undefined>(undefined),[notice,setNotice]=useState('');
 const load=useCallback(async()=>{setLoading(true);setError('');try{const r=await fetch(`/api/modulos/${id}?page=${page}&archived=${archived}`,{cache:'no-store'}),j=await r.json();if(!r.ok)throw new Error(j.error);setData(j);}catch(e){setError((e as Error).message);setData(null);}finally{setLoading(false);}},[id,page,archived]);
 useEffect(()=>{void load();},[load]);
 async function mutate(action:string,record:ModuleRecord|null,values?:Record<string,string|boolean>){if(!data)return;setBusy(true);setError('');try{const r=await fetch(`/api/modulos/${id}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,id:record?.id,revision:record?.revision,version:data.version,values})}),j=await r.json();if(!r.ok)throw new Error(j.error);setEditing(undefined);setNotice(action==='archive'?'Registro arquivado. Você pode restaurá-lo na lista de arquivados.':'Alteração salva.');await load();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 return <main className="lab-studio lab-runtime"><header className="lab-top"><Link href="/painel" showLoading><VinkuloMark size={36}/> Voltar ao painel</Link><span>{data?.community}</span><button disabled={loading||busy} onClick={()=>void load()}>Atualizar</button></header>
 {error&&<p className="lab-error" role="alert">{error}</p>}{notice&&<p role="status" className="lab-notice">{notice}</p>}
 {loading?<p role="status">Carregando aba…</p>:data&&<><header className="lab-top"><div><h1>{data.definition.name}</h1><p>{data.definition.description}</p></div>{data.canWrite&&data.definition.allowCreate&&<button className="lab-primary" disabled={busy} onClick={()=>setEditing(null)}>＋ Novo registro</button>}</header>
 {editing!==undefined?<section className="lab-panel"><h2>{editing?'Editar registro':'Novo registro'}</h2><LabModuleForm key={editing?.id||'new'} definition={data.definition} initial={editing?.values} busy={busy} onCancel={()=>setEditing(undefined)} onSave={values=>void mutate(editing?'save':'create',editing,values)}/></section>:<>
 <div className="lab-top"><label>Buscar nesta página<input value={search} onChange={e=>setSearch(e.target.value)}/></label><button onClick={()=>{setArchived(!archived);setPage(0);}}>{archived?'Ver ativos':'Ver arquivados'}</button><span>{data.total} registros {archived?'arquivados':'ativos'}</span></div>
 <div className="lab-records">{data.records.filter(r=>Object.values(r.values).join(' ').toLocaleLowerCase().includes(search.toLocaleLowerCase())).map(r=><article className="lab-panel" key={r.id}><dl>{data.definition.fields.map(f=><div key={f.id}><dt>{f.label}</dt><dd>{typeof r.values[f.id]==='boolean'?(r.values[f.id]?'Sim':'Não'):String(r.values[f.id]||'—')}</dd></div>)}</dl><footer className="lab-actions">{data.canWrite&&data.definition.allowEdit&&!archived&&<button disabled={busy} onClick={()=>setEditing(r)}>Editar</button>}{data.canWrite&&data.definition.allowArchive&&<button disabled={busy} onClick={()=>void mutate(archived?'restore':'archive',r)}>{archived?'Restaurar':'Arquivar'}</button>}</footer></article>)}</div>
 {!data.records.length&&<p className="lab-empty">Nenhum registro {archived?'arquivado':'cadastrado'}.</p>}
 <nav className="lab-actions" aria-label="Páginas dos registros"><button disabled={!page} onClick={()=>setPage(page-1)}>Anterior</button><span>Página {page+1}</span><button disabled={(page+1)*50>=data.total} onClick={()=>setPage(page+1)}>Próxima</button></nav></>}
 </>}
 </main>;
}
