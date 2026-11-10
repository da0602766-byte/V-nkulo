"use client";
import {useEffect,useId,useRef,type ReactNode} from "react";
import {createPortal} from "react-dom";
import "./ActionDialog.css";
import VinkuloActionMark from "./VinkuloActionMark";
export default function ActionDialog({title,children,onClose,busy=false,failed=false}:{title:string;children:ReactNode;onClose:()=>void;busy?:boolean;failed?:boolean}){
 const ref=useRef<HTMLDialogElement>(null),titleId=useId();
 useEffect(()=>{const previous=document.activeElement as HTMLElement|null;const dialog=ref.current;dialog?.showModal();return()=>{dialog?.close();previous?.focus();};},[]);
 if(typeof document==='undefined')return null;
 return createPortal(<dialog ref={ref} className="v-action-dialog" aria-busy={busy} aria-labelledby={titleId} onCancel={e=>{e.preventDefault();if(!busy)onClose();}}><header><div className="vinkulo-dialog-title"><VinkuloActionMark state={busy ? "pending" : failed ? "error" : "idle"} size={38}/><h2 id={titleId}>{title}</h2></div><button type="button" aria-label="Fechar confirmação" disabled={busy} onClick={onClose}>×</button></header>{children}</dialog>,document.body);
}
