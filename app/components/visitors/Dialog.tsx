"use client";
import {useEffect,useId,useRef,type ReactNode} from 'react';
import VinkuloActionMark from '../VinkuloActionMark';

export function Dialog({title,onClose,children,wide=false,busy=false,failed=false}:{title:string;onClose:()=>void;children:ReactNode;wide?:boolean;busy?:boolean;failed?:boolean}) {
  const ref=useRef<HTMLDialogElement>(null), heading=useId();
  useEffect(()=>{const focus=document.activeElement as HTMLElement|null;ref.current?.showModal();return()=>{focus?.focus()};},[]);
  return <dialog ref={ref} className={`vp-dialog ${wide?'vp-dialog-wide':''}`} aria-busy={busy} aria-labelledby={heading} onCancel={event=>{event.preventDefault();if(!busy)onClose();}} onClick={event=>{
    if(busy||event.target!==event.currentTarget)return;
    const box=event.currentTarget.getBoundingClientRect();
    if(event.clientX<box.left||event.clientX>box.right||event.clientY<box.top||event.clientY>box.bottom)onClose();
  }}>
    <header><div className="vinkulo-dialog-title"><VinkuloActionMark state={busy?'pending':failed?'error':'idle'} size={38}/><h2 id={heading}>{title}</h2></div><button type="button" disabled={busy} onClick={onClose} aria-label="Fechar">×</button></header>{children}
  </dialog>;
}
