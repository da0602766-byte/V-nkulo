"use client";
import {useRef,type RefObject} from 'react';
import {useBrowserStorage} from '../useBrowserStorage';

const parseBoolean=(raw:string|null)=>raw==='true';
export function useVisitorPreference(key:string):[boolean,(value:boolean)=>void] {
  const [value,setValue]=useBrowserStorage(`vp-layout-${key}`,parseBoolean);
  return [value,setValue];
}
const minimum=[44,170,120,120,88,110,110];
const storageKey='vp-layout-columns-v1';
function parseWidths(raw:string|null):number[]|null {
  try {const v=JSON.parse(raw||'null');return Array.isArray(v)&&v.length===7&&v.every((n,i)=>Number.isFinite(n)&&n>=minimum[i]&&n<=800)?v:null;}catch{return null;}
}
export function useColumnWidths(){
  const tableRef=useRef<HTMLTableElement>(null);
  const [widths,save]=useBrowserStorage(storageKey,parseWidths);
  function measure(){return Array.from(tableRef.current?.querySelectorAll('thead th')||[]).map(e=>(e as HTMLElement).offsetWidth);}
  function resize(index:number,width:number,base:number[]){const next=base.map((w,i)=>Math.max(minimum[i],Math.min(800,w)));next[index]=Math.max(minimum[index],Math.min(800,Math.round(width)));save(next);}
  return {tableRef,widths,measure,resize,reset:()=>save(null)};
}
export function ColumnHandle({index,label,columns,tableRef}:{index:number;label:string;columns:Omit<ReturnType<typeof useColumnWidths>,"tableRef">;tableRef:RefObject<HTMLTableElement|null>}){
  const drag=useRef<{x:number;values:number[];scale:number}|null>(null);
  return <span className="vp-column-handle" role="separator" tabIndex={0} aria-orientation="vertical" aria-label={`Largura da coluna ${label}`} aria-valuemin={minimum[index]} aria-valuemax={800} aria-valuenow={columns.widths?.[index]} title="Arraste para ajustar. Use as setas do teclado ou dê dois cliques para restaurar."
    onPointerDown={e=>{if(e.button!==0)return;e.preventDefault();const table=tableRef.current;if(!table)return;drag.current={x:e.clientX,values:columns.measure(),scale:table.getBoundingClientRect().width/table.offsetWidth};e.currentTarget.setPointerCapture(e.pointerId);}}
    onPointerMove={e=>{const d=drag.current;if(d)columns.resize(index,d.values[index]+(e.clientX-d.x)/d.scale,d.values);}}
    onPointerUp={e=>{drag.current=null;if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);}}
    onPointerCancel={()=>{drag.current=null;}} onLostPointerCapture={()=>{drag.current=null;}}
    onDoubleClick={columns.reset} onKeyDown={e=>{if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();const values=columns.measure();columns.resize(index,values[index]+(e.key==='ArrowRight'?1:-1)*(e.shiftKey?40:10),values);}else if(e.key==='Home'){e.preventDefault();columns.reset();}}}/>
}
