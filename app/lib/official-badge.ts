export function officialBadge(title?:string|null,official=false){
  if(!official&&!title?.trim())return null;
  const normalized=(title||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toUpperCase();
  const tone=normalized==='ASPIRANTE'?'aspirant':['DIACONO','DIACONISA'].includes(normalized)?'deacon':['PRESBITERO','PRESBITERA'].includes(normalized)?'elder':['PASTOR','PASTORA'].includes(normalized)?'pastor':'official';
  return {tone,label:title?.trim()?`Oficial da comunidade · ${title.trim()}`:'Oficial da comunidade'};
}
