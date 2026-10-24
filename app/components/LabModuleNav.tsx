"use client";
import {useEffect,useState} from "react";
import Link from "./StableLink";
export default function LabModuleNav({communityId}:{communityId:number}){
 const [result,setResult]=useState<{communityId:number;modules:{id:string;name:string}[]}|null>(null);
 const modules=result?.communityId===communityId?result.modules:[];
 useEffect(()=>{const controller=new AbortController();void fetch('/api/modulos',{signal:controller.signal,cache:'no-store'}).then(r=>r.ok?r.json():{modules:[]}).then(j=>{if(!controller.signal.aborted)setResult({communityId,modules:j.modules||[]});}).catch(()=>{});return()=>controller.abort();},[communityId]);
 if(!modules.length)return null;
 return <section className="pilot-sidebar-group" aria-label="Abas publicadas"><h2>Abas da comunidade</h2>{modules.map(m=><Link key={m.id} href={`/painel/modulos/${m.id}`} showLoading title={m.name}><span className="pilot-sidebar-icon" aria-hidden="true">▦</span><span className="pilot-sidebar-label">{m.name}</span></Link>)}</section>;
}
