"use client";
import {useEffect,useId,useRef,type ReactNode} from "react";
import {createPortal} from "react-dom";
import "./ActionDialog.css";
export default function ActionDialog({title,children,onClose,busy=false}:{title:string;children:ReactNode;onClose:()=>void;busy?:boolean}){
 const ref=useRef<HTMLDialogElement>(null),titleId=useId();
 useEffect(()=>{const previous=document.activeElement as HTMLElement|null;ref.current?.showModal();return()=>{ref.current?.close();previous?.focus();};},[]);
 if(typeof document==='undefined')return null;
 return createPortal(<dialog ref={ref} className="v-action-dialog" aria-labelledby={titleId} onCancel={e=>{e.preventDefault();if(!busy)onClose();}}><header><h2 id={titleId}>{title}</h2><button type="button" aria-label="Fechar confirmação" disabled={busy} onClick={onClose}>×</button></header>{children}</dialog>,document.body);
}
