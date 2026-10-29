"use client";
import type {ModuleDefinition} from '../lib/lab-modules';
import LabLayoutView from './LabLayoutView';
export default function LabRecordContent({definition,moduleId,values,preview=false}:{definition:ModuleDefinition;moduleId:string;values:Record<string,string|boolean>;preview?:boolean}){
 return <LabLayoutView definition={definition} moduleId={moduleId} scope="record" preview={preview} field={id=>{const f=definition.fields.find(f=>f.id===id);if(!f)return null;const v=values[id];return <dl className="lab-layout-field-value"><dt>{f.label}</dt><dd>{typeof v==='boolean'?(v?'Sim':'Não'):String(v||'—')}</dd></dl>;}}/>;
}
