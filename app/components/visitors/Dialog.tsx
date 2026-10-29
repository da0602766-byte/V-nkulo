"use client";
import {useEffect,useId,useRef,type ReactNode} from 'react';

export function Dialog({title,onClose,children,wide=false}:{title:string;onClose:()=>void;children:ReactNode;wide?:boolean}) {
  const ref=useRef<HTMLDialogElement>(null), heading=useId();
  useEffect(()=>{const focus=document.activeElement as HTMLElement|null;ref.current?.showModal();return()=>{focus?.focus()};},[]);
  return <dialog ref={ref} className={`vp-dialog ${wide?'vp-dialog-wide':''}`} aria-labelledby={heading} onCancel={event=>{event.preventDefault();onClose();}} onClick={event=>{
    if(event.target!==event.currentTarget)return;
    const box=event.currentTarget.getBoundingClientRect();
    if(event.clientX<box.left||event.clientX>box.right||event.clientY<box.top||event.clientY>box.bottom)onClose();
  }}>
    <header><h2 id={heading}>{title}</h2><button type="button" onClick={onClose} aria-label="Fechar">×</button></header>{children}
  </dialog>;
}
