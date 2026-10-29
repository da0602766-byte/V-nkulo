"use client";
import {useEffect,useState} from "react";
import Link from "./StableLink";
import FeedIcon from "./feed/FeedIcon";
import {DEFAULT_COMMUNITY_HIGHLIGHT,type CommunityHighlight} from "../lib/community-highlight";
import "./feed-prayer.css";
export function SignatureArtwork({text,icon}:{text:string;icon:CommunityHighlight["signatureIcon"]}) {
 return <><span>{text}</span>{icon==="heart"?<FeedIcon name="heart"/>:icon==="sparkle"?<svg className="worship-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5Z"/></svg>:null}</>;
}
export default function CommunitySignature({communityId,communityName,communitySlug}:{communityId:number;communityName:string;communitySlug:string}) {
 const[value,setValue]=useState(DEFAULT_COMMUNITY_HIGHLIGHT),[canEdit,setCanEdit]=useState(false);
 useEffect(()=>{const controller=new AbortController();fetch("/api/pilot/community-highlight",{cache:"no-store",signal:controller.signal}).then(async response=>{if(!response.ok)return;const data=await response.json();if(!controller.signal.aborted&&data.communityId===communityId){setValue({...DEFAULT_COMMUNITY_HIGHLIGHT,...data.highlight});setCanEdit(data.canEdit);}}).catch(()=>{});return()=>controller.abort();},[communityId]);
 return <div className="worship-signature-wrap"><Link className="worship-signature" href={`/comunidades/${communitySlug}`} aria-label={`Página pública de ${communityName}`}><SignatureArtwork text={value.signatureText} icon={value.signatureIcon}/></Link>{canEdit&&<a className="signature-edit" href="/painel?view=configuracoes#mensagem-mural">Editar mensagem</a>}</div>;
}
