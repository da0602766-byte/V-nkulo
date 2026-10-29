import type { ModuleDefinition } from './lab-modules';

export const BLOCK_TYPES = ['heading','text','card','image','button','divider','stat','records','field'] as const;
export type BlockType = typeof BLOCK_TYPES[number];
export type LayoutScope = 'page' | 'form' | 'record';
export type LayoutBlock = {
  id: string; type: BlockType; parent: string; title: string; text: string;
  width: number; mobile: number; align: 'left'|'center'|'right'; tone: 'plain'|'soft'|'accent';
  fieldId: string; assetId: string; url: string; alt: string;
  fit: 'cover'|'contain'; ratio: 'auto'|'square'|'landscape'|'portrait';
  action: 'create'|'refresh'|'records'|'link';
};
export type ModuleLayout = { version: 1; gap: 'compact'|'comfortable'; page: LayoutBlock[]; form: LayoutBlock[]; record: LayoutBlock[] };
export const BLOCK_NAMES: Record<BlockType,string> = {heading:'Título',text:'Texto',card:'Cartão / grupo',image:'Foto',button:'Botão',divider:'Divisor',stat:'Total de registros',records:'Lista de registros',field:'Campo'};
const text = (v:unknown,n:number) => String(v??'').trim().slice(0,n);
export const assetIdValid = (v:string) => /^[a-f0-9]{8}-[a-f0-9-]{27}$/.test(v);
export function safeLayoutUrl(v:unknown) {
  const s=text(v,1500);
  if(!s)return '';
  if(/^\/painel(?:[/?#]|$)/.test(s)&&!/[\\\s]/.test(s))return s;
  try { const u=new URL(s); return u.protocol==='https:'&&!u.username&&!u.password?u.href:''; } catch { return ''; }
}
export function newBlock(type:BlockType,id='b_'+crypto.randomUUID()):LayoutBlock {
  return {id,type,parent:'',title:type==='heading'?'Novo título':type==='card'?'Novo cartão':type==='button'?'Novo registro':'',text:'',width:['card','image','stat'].includes(type)?4:12,mobile:12,align:'left',tone:type==='card'?'soft':'plain',fieldId:'',assetId:'',url:'',alt:'',fit:'cover',ratio:'landscape',action:'create'};
}
export function defaultLayout(d:ModuleDefinition):ModuleLayout {
  return {version:1,gap:'compact',page:[newBlock('records','b_records')],form:d.fields.map(f=>({...newBlock('field','b_form_'+f.id),fieldId:f.id,width:f.type==='textarea'?12:6})),record:d.fields.map(f=>({...newBlock('field','b_record_'+f.id),fieldId:f.id}))};
}
export function parseLayout(raw:unknown,d:ModuleDefinition):ModuleLayout|undefined {
  if(raw==null)return undefined;
  const s=raw as Partial<ModuleLayout>,result=defaultLayout(d);
  result.gap=s.gap==='comfortable'?'comfortable':'compact';
  for(const scope of ['page','form','record'] as const){
    if(!Array.isArray(s[scope])||s[scope]!.length>60)throw new Error('Cada área do layout aceita até 60 blocos.');
    result[scope]=s[scope]!.map(b=>{
      if(!b||!BLOCK_TYPES.includes(b.type)||!/^b_[a-z0-9_-]{1,90}$/.test(b.id))throw new Error('Bloco de layout inválido.');
      if(scope==='page'&&b.type==='field'||scope!=='page'&&['records','stat','button'].includes(b.type))throw new Error('Este bloco não pertence a esta área do layout.');
      return {...newBlock(b.type,b.id),parent:text(b.parent,92),title:text(b.title,120),text:text(b.text,2000),width:[3,4,6,8,12].includes(b.width)?b.width:12,mobile:b.mobile===6?6:12,align:['left','center','right'].includes(b.align)?b.align:'left',tone:['plain','soft','accent'].includes(b.tone)?b.tone:'plain',fieldId:text(b.fieldId,64),assetId:assetIdValid(b.assetId||'')?b.assetId:'',url:safeLayoutUrl(b.url),alt:text(b.alt,240),fit:b.fit==='contain'?'contain':'cover',ratio:['auto','square','landscape','portrait'].includes(b.ratio)?b.ratio:'landscape',action:['create','refresh','records','link'].includes(b.action)?b.action:'create'} as LayoutBlock;
    });
    const blocks=result[scope],ids=new Set(blocks.map(b=>b.id));
    if(ids.size!==blocks.length)throw new Error('Os blocos precisam de identificadores únicos.');
    for(const b of blocks)if(b.parent&&(!blocks.some(p=>p.id===b.parent&&p.type==='card'&&!p.parent)||b.type==='card'))throw new Error('Um grupo pode conter blocos, mas não outros grupos.');
    const fields=blocks.filter(b=>b.type==='field').map(b=>b.fieldId);
    if(new Set(fields).size!==fields.length||fields.some(id=>!d.fields.some(f=>f.id===id)))throw new Error('Revise os campos do layout.');
    if(blocks.filter(b=>b.type==='records').length>1)throw new Error('Use apenas uma lista de registros.');
  }
  return result;
}
// New fields remain visible even when an older layout was saved; removing a block
// never makes a required input or an existing record value inaccessible.
export function resolvedLayout(d:ModuleDefinition):ModuleLayout {
  const layout=d.layout?structuredClone(d.layout):defaultLayout(d);
  for(const scope of ['form','record'] as const){
    layout[scope]=layout[scope].filter(b=>b.type!=='field'||d.fields.some(f=>f.id===b.fieldId));
    for(const f of d.fields)if(!layout[scope].some(b=>b.type==='field'&&b.fieldId===f.id))layout[scope].push({...newBlock('field','b_'+scope+'_'+f.id),fieldId:f.id,width:scope==='form'&&f.type!=='textarea'?6:12});
  }
  if(!layout.page.some(b=>b.type==='records'))layout.page.push(newBlock('records','b_records'));
  return layout;
}
export function layoutIssues(d:ModuleDefinition):string[]{
  if(!d.layout)return [];
  const issues:string[]=[];
  for(const scope of ['page','form','record'] as const)for(const b of d.layout[scope]){
    if(b.type==='image'&&(!b.assetId&&!/^https:\/\//.test(b.url)))issues.push('Adicione uma foto aos blocos de imagem ou remova as caixas vazias.');
    if(b.type==='image'&&!b.alt)issues.push('Descreva as fotos para leitores de tela.');
    if(['heading','button'].includes(b.type)&&!b.title)issues.push('Preencha o texto dos títulos e botões.');
    if(b.type==='button'&&b.action==='link'&&!b.url)issues.push('Informe um endereço válido nos botões de link.');
  }
  return [...new Set(issues)];
}
export function layoutHasAsset(d:ModuleDefinition,id:string){return !!d.layout&&(['page','form','record'] as const).some(s=>d.layout![s].some(b=>b.type==='image'&&b.assetId===id));}
export function moveLayoutBlock(blocks:LayoutBlock[],id:string,parent:string,before=''):LayoutBlock[]{
  const target=blocks.find(b=>b.id===id);if(!target||id===before||parent===id)return blocks;
  if(parent&&(!blocks.some(b=>b.id===parent&&b.type==='card'&&!b.parent)||target.type==='card'))return blocks;
  const next=blocks.filter(b=>b.id!==id),at=before?next.findIndex(b=>b.id===before&&b.parent===parent):-1;
  next.splice(at<0?next.length:at,0,{...target,parent});return next;
}
