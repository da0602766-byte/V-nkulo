"use client";
import {useCallback,useEffect,useState} from 'react';
type Draft={id:string;tarefa:string;voluntarioId:string};
type Model={id:number;nome:string;itens:Omit<Draft,'id'>[];versao:number};
export default function ChecklistTemplates({ministryId,draft,onApply}:{ministryId:number;draft:Draft[];onApply:(value:Draft[])=>void}){
  const [models,setModels]=useState<Model[]>([]),[selected,setSelected]=useState(''),[name,setName]=useState(''),[message,setMessage]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  const load=useCallback(async()=>{const response=await fetch(`/api/pilot/ministerios/checklist-modelos?ministerioId=${ministryId}`);const data=await response.json();if(!response.ok)throw new Error(data.error);setModels(data.modelos);},[ministryId]);
  useEffect(()=>{
    let cancelled=false;
    const timer=window.setTimeout(()=>{
      void fetch(`/api/pilot/ministerios/checklist-modelos?ministerioId=${ministryId}`)
        .then(async response=>{const data=await response.json();if(!response.ok)throw new Error(data.error);if(!cancelled)setModels(data.modelos);})
        .catch(cause=>{if(!cancelled)setError(cause.message);});
    },0);
    return()=>{cancelled=true;window.clearTimeout(timer);};
  },[ministryId]);
  const model=models.find(item=>item.id===Number(selected));
  async function save(update:boolean){setBusy(true);setError('');setMessage('');try{const response=await fetch('/api/pilot/ministerios/checklist-modelos',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ministerioId: ministryId,nome:name,itens:draft.filter(item=>item.tarefa.trim()),...(update&&model?{id:model.id,versao:model.versao}:{})})});const data=await response.json();if(!response.ok)throw new Error(data.error);await load();setMessage('Modelo salvo com as tarefas e responsáveis.');}catch(cause){setError((cause as Error).message);}finally{setBusy(false);}}
  return <details className="checklist-templates"><summary>Modelos salvos de checklist</summary><p>Salve as tarefas e responsáveis abaixo para reutilizar em outras escalas. Aplicar um modelo substitui o checklist em edição.</p><div className="ministry-inline-controls"><label>Modelo<select value={selected} onChange={event=>{setSelected(event.target.value);setName(models.find(item=>item.id===Number(event.target.value))?.nome||'');}}><option value="">Novo modelo</option>{models.map(item=><option key={item.id} value={item.id}>{item.nome} · {item.itens.length} tarefas</option>)}</select></label><button type="button" disabled={!model||busy} onClick={()=>{if(model){onApply(model.itens.map(item=>({...item,id:crypto.randomUUID()})));setMessage('Modelo aplicado. Edite as tarefas e salve o modelo para atualizar.');}}}>Aplicar modelo</button><button type="button" disabled={busy} onClick={()=>void load().catch(cause=>setError(cause.message))}>Recarregar</button></div><div className="ministry-inline-controls"><label>Nome do modelo<input value={name} maxLength={100} onChange={event=>setName(event.target.value)} placeholder="Ex.: Culto de domingo" /></label><button type="button" disabled={busy||!name.trim()||!draft.some(item=>item.tarefa.trim())} onClick={()=>void save(false)}>Salvar como novo</button>{model&&<button type="button" disabled={busy||!name.trim()} onClick={()=>void save(true)}>Atualizar modelo</button>}</div>{error&&<p role="alert">{error}</p>}{message&&<p role="status">{message}</p>}</details>;
}
