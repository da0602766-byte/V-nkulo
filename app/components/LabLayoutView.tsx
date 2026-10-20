"use client";
import type {CSSProperties,ReactNode} from 'react';
import type {ModuleDefinition} from '../lib/lab-modules';
import {resolvedLayout,safeLayoutUrl,type LayoutBlock,type LayoutScope} from '../lib/lab-layout';
import './LabLayout.css';

export function LayoutContent({block:b,moduleId,children,total=0,onAction,canCreate=true,preview=false}:{block:LayoutBlock;moduleId:string;children?:ReactNode;total?:number;onAction?:(action:string)=>void;canCreate?:boolean;preview?:boolean}){
  if(b.type==='heading')return <h3>{b.title}</h3>;
  if(b.type==='text')return <p className="lab-copy">{b.text||'Texto de apoio'}</p>;
  if(b.type==='divider')return <hr/>;
  if(b.type==='card')return <section className={`lab-layout-card tone-${b.tone}`}>{b.title&&<h3>{b.title}</h3>}{b.text&&<p className="lab-copy">{b.text}</p>}{children}</section>;
  if(b.type==='stat')return <div className={`lab-layout-stat tone-${b.tone}`}><span>{b.title||'Total de registros'}</span><strong>{total}</strong>{b.text&&<small>{b.text}</small>}</div>;
  if(b.type==='image'){
    const src=b.assetId?`/api/modulos/${moduleId}/imagens/${b.assetId}`:/^https:\/\//.test(b.url)?safeLayoutUrl(b.url):'';
    return <figure className={`lab-layout-image ratio-${b.ratio}`} style={{'--image-fit':b.fit} as CSSProperties}>{src?<img src={src} alt={b.alt} loading="lazy"/>:<div className="lab-image-placeholder"><span aria-hidden="true">▧</span>Adicione uma foto</div>}{(b.title||b.text)&&<figcaption>{b.title&&<strong>{b.title}</strong>}{b.text&&<span>{b.text}</span>}</figcaption>}</figure>;
  }
  if(b.type==='button'){
    if(b.action==='create'&&!canCreate)return null;
    if(b.action==='link'&&!preview){const href=safeLayoutUrl(b.url);return href?<a className={`lab-layout-button tone-${b.tone}`} href={href} {...(href.startsWith('https:')?{target:'_blank',rel:'noopener noreferrer'}:{})}>{b.title}</a>:null;}
    return <button type="button" className={`lab-layout-button tone-${b.tone}`} onClick={()=>onAction?.(b.action)}>{b.title}</button>;
  }
  return <>{children}</>;
}
export default function LabLayoutView({definition,moduleId,scope,field,records,total,onAction,canCreate,preview}:{definition:ModuleDefinition;moduleId:string;scope:LayoutScope;field?:(id:string)=>ReactNode;records?:ReactNode;total?:number;onAction?:(action:string)=>void;canCreate?:boolean;preview?:boolean}){
  const layout=resolvedLayout(definition),blocks=layout[scope];
  const render=(parent='')=><div className="lab-layout-grid">{blocks.filter(b=>b.parent===parent).map(b=><div key={b.id} className={`lab-layout-cell block-${b.type}`} style={{'--block-span':b.width,'--mobile-span':b.mobile,textAlign:b.align} as CSSProperties}><LayoutContent block={b} moduleId={moduleId} total={total} onAction={onAction} canCreate={canCreate} preview={preview}>{b.type==='card'?render(b.id):b.type==='field'?field?.(b.fieldId):b.type==='records'?records:null}</LayoutContent></div>)}</div>;
  return <div className={`lab-layout-root gap-${layout.gap}`}>{render()}</div>;
}
