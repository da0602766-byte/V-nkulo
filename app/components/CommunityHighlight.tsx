"use client";
import { useEffect, useRef, useState } from "react";
import SafeImage from "./SafeImage";
import NativeImageUpload from "./NativeImageUpload";
import { DEFAULT_COMMUNITY_HIGHLIGHT, parseCommunityHighlight, type CommunityHighlight as Highlight } from "../lib/community-highlight";
import "./community-highlight.css";

export function HighlightCard({value}:{value:Highlight}) {
 return <div className={`worship-sidebar-art community-highlight-card ${value.imageUrl ? "has-image" : ""}`}>
  {value.imageUrl && <SafeImage src={value.imageUrl} alt={value.imageAlt} loading="lazy"/>}
  <div className="community-highlight-copy">{value.eyebrow&&<small>{value.eyebrow}</small>}{value.title&&<p>{value.title}</p>}{value.content&&<div>{value.content}</div>}{value.verse&&<blockquote>{value.verse}{value.reference&&<cite>{value.reference}</cite>}</blockquote>}{!value.verse&&value.reference&&<cite>{value.reference}</cite>}</div>
 </div>;
}
export default function CommunityHighlight({communityId,editor=false}:{communityId:number;editor?:boolean}) {
 const [value,setValue]=useState<Highlight>(DEFAULT_COMMUNITY_HIGHLIGHT),[loading,setLoading]=useState(true),[canEdit,setCanEdit]=useState(false),[canUpload,setCanUpload]=useState(false),[error,setError]=useState(""),[message,setMessage]=useState(""),[saving,setSaving]=useState(false),[retry,setRetry]=useState(0);
 const savingRef=useRef(false);
 useEffect(()=>{const controller=new AbortController();setLoading(true);setCanEdit(false);setError("");
 fetch("/api/pilot/community-highlight",{cache:"no-store",signal:controller.signal}).then(async response=>{const data=await response.json();if(!response.ok)throw Error(data.error||"Não foi possível carregar o destaque.");if(data.communityId!==communityId)throw Error("A comunidade ativa mudou. Reabra esta tela.");if(!controller.signal.aborted){setValue(parseCommunityHighlight(data.highlight));setCanEdit(data.canEdit);setCanUpload(data.canUpload);}}).catch(cause=>{if(!controller.signal.aborted)setError(cause.message);}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});return()=>controller.abort();},[communityId,retry]);
 const update=(key:keyof Highlight,next:string|boolean)=>{setValue(current=>({...current,[key]:next}));setMessage("");};
 async function save(){if(savingRef.current)return;setError("");setMessage("");let highlight;try{highlight=parseCommunityHighlight(value);}catch(cause){setError((cause as Error).message);return;}savingRef.current=true;setSaving(true);
 try{const response=await fetch("/api/pilot/community-highlight",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({communityId,highlight})});const data=await response.json();if(!response.ok)throw Error(data.error||"Não foi possível salvar. Seu preenchimento foi mantido.");if(data.communityId!==communityId)throw Error("A comunidade ativa mudou.");setValue(data.highlight);setMessage("Destaque salvo. A alteração aparece no menu lateral do Início.");}catch(cause){setError((cause as Error).message);}finally{savingRef.current=false;setSaving(false);}}
 if(!editor) return loading||error||!value.enabled?null:<section className="community-highlight-sidebar" aria-label="Destaque da comunidade"><HighlightCard value={value}/>{canEdit&&<a className="community-highlight-edit" href="/painel?view=configuracoes#destaque-lateral">Editar destaque</a>}</section>;
 return <section id="destaque-lateral" className="community-highlight-editor"><header><h2>Destaque do menu lateral</h2><p>Personalize a mensagem que aparece no Início para sua comunidade.</p></header>
 {loading?<p role="status">Carregando destaque…</p>:!canEdit?<><p>{error||"Você não tem permissão para editar este conteúdo."}</p>{error&&<button type="button" onClick={()=>setRetry(n=>n+1)}>Tentar novamente</button>}</>:<form onSubmit={event=>{event.preventDefault();void save();}}><fieldset disabled={saving}><label className="highlight-toggle"><input type="checkbox" checked={value.enabled} onChange={e=>update("enabled",e.target.checked)}/>Mostrar destaque no menu lateral</label><div className="highlight-editor-grid"><div className="highlight-fields">
 <label>Chamada curta<input value={value.eyebrow} maxLength={60} onChange={e=>update("eyebrow",e.target.value)}/></label>
 <label>Título<textarea rows={2} value={value.title} maxLength={120} onChange={e=>update("title",e.target.value)}/></label>
 <label>Mensagem<textarea rows={3} value={value.content} maxLength={400} onChange={e=>update("content",e.target.value)}/></label>
 <label>Versículo<textarea rows={3} value={value.verse} maxLength={500} placeholder="Escreva o texto do versículo" onChange={e=>update("verse",e.target.value)}/></label>
 <label>Referência bíblica<input value={value.reference} maxLength={80} placeholder="Ex.: Salmos 133:1" onChange={e=>update("reference",e.target.value)}/></label>
 {canUpload&&<NativeImageUpload label="Imagem do destaque" value={value.imageUrl} purpose="community-banner" previewMode="banner" onChange={url=>update("imageUrl",url)}/>}
 <label>Endereço da imagem (opcional)<input type="text" inputMode="url" value={value.imageUrl} maxLength={2000} placeholder="https://…" onChange={e=>update("imageUrl",e.target.value)}/></label>
 <label>Descrição da imagem<input value={value.imageAlt} maxLength={180} required={Boolean(value.imageUrl)} onChange={e=>update("imageAlt",e.target.value)} /></label>
 {value.imageUrl&&<button type="button" onClick={()=>{update("imageUrl","");update("imageAlt","");}}>Remover imagem do destaque</button>}
 <p className="highlight-help">O envio de arquivo usa o Google Drive configurado na conta. Você também pode informar o endereço HTTPS de uma imagem.</p>
 </div><aside className="highlight-preview"><strong>Prévia</strong><HighlightCard value={value}/>{!value.enabled&&<p>O destaque está oculto para a comunidade.</p>}</aside></div><button type="submit">{saving?"Salvando…":"Salvar destaque"}</button></fieldset></form>}
 {error&&canEdit&&<p role="alert">{error}</p>}{message&&<p role="status">{message}</p>}</section>;
}
