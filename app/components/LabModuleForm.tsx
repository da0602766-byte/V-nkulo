"use client";
import {useState} from "react";
import {validateModuleValues,type ModuleDefinition} from "../lib/lab-modules";
import LabLayoutView from './LabLayoutView';
export default function LabModuleForm({definition,moduleId='',initial={},onSave,onCancel,busy=false,preview=false}:{definition:ModuleDefinition;moduleId?:string;initial?:Record<string,string|boolean>;onSave:(v:Record<string,string|boolean>)=>void;onCancel:()=>void;busy?:boolean;preview?:boolean}){
  const [values,setValues]=useState(initial),[error,setError]=useState('');
  return <form className="lab-form" onSubmit={e=>{e.preventDefault();try{setError('');onSave(validateModuleValues(definition,values));}catch(e){setError((e as Error).message);}}}>
    {preview&&<p className="lab-hint">Prévia interativa: os dados preenchidos aqui não são gravados.</p>}
    <LabLayoutView definition={definition} moduleId={moduleId} scope="form" preview={preview} field={id=>{const f=definition.fields.find(f=>f.id===id);if(!f)return null;return <label key={f.id}>{f.label||'Campo sem nome'}{f.required?' *':''}
      {f.type==='textarea'?<textarea disabled={busy} value={String(values[f.id]||'')} maxLength={4000} required={f.required} onChange={e=>setValues({...values,[f.id]:e.target.value})}/>:
       f.type==='select'?<select disabled={busy} value={String(values[f.id]||'')} required={f.required} onChange={e=>setValues({...values,[f.id]:e.target.value})}><option value="">Selecione</option>{f.options.map(o=><option key={o}>{o}</option>)}</select>:
       f.type==='checkbox'?<input disabled={busy} type="checkbox" checked={values[f.id]===true} required={f.required} onChange={e=>setValues({...values,[f.id]:e.target.checked})}/>:
       <input disabled={busy} type={f.type} step={f.type==='number'?'any':undefined} value={String(values[f.id]??'')} required={f.required} maxLength={500} onChange={e=>setValues({...values,[f.id]:e.target.value})}/>}</label>;}}/>
    {error&&<p role="alert" className="lab-error">{error}</p>}
    <footer className="lab-actions"><button type="button" disabled={busy} onClick={onCancel}>Cancelar</button><button className="lab-primary" disabled={busy}>{busy?'Salvando…':preview?'Testar validação':'Salvar registro'}</button></footer>
  </form>;
}
