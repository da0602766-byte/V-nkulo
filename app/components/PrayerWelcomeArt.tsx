"use client";
import {useEffect,useState} from "react";
import SafeImage from "./SafeImage";
import "./settings-redesign.css";

export default function PrayerWelcomeArt({communityId}:{communityId?:number}) {
 const [result,setArt]=useState({communityId,url:"",alt:"",canEdit:false});
 const art=result.communityId===communityId?result:{url:"",alt:"",canEdit:false};
 useEffect(()=>{if(!communityId)return;const controller=new AbortController();
 fetch("/api/pilot/community-highlight",{signal:controller.signal,cache:"no-store"}).then(async response=>{if(!response.ok)return;const data=await response.json();if(!controller.signal.aborted&&data.communityId===communityId)setArt({communityId,url:data.highlight.prayerImageUrl||"",alt:data.highlight.prayerImageAlt||"",canEdit:data.canEdit===true});}).catch(()=>{});return()=>controller.abort();},[communityId]);
 return <div className={`request-welcome-art${art.url?" has-custom-image":""}`}>
 {art.url?<SafeImage src={art.url} alt={art.alt}/>:<><span aria-hidden="true"/><i>Juntos em oração</i></>}
 {art.canEdit&&<a className="prayer-art-edit" href="/painel?view=configuracoes#imagem-pedidos">Editar imagem</a>}
 </div>;
}
