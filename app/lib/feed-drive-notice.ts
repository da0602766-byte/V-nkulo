export type DriveNoticeCheck={id:string;own:boolean;status:'FULL'|'AVAILABLE'|'UNKNOWN'};
export type DriveNoticeMemory=Record<string,{full:boolean;collapsed:boolean}>;
export function parseDriveNoticeMemory(raw:string|null):DriveNoticeMemory {
  try {
    const input=JSON.parse(raw||'{}') as unknown;
    if(!input||typeof input!=='object'||Array.isArray(input))return {};
    const result:DriveNoticeMemory={};
    for(const id of ['own','shared-visitors']){
      const value=(input as DriveNoticeMemory)[id];
      if(value&&typeof value.full==='boolean'&&typeof value.collapsed==='boolean')result[id]={full:value.full,collapsed:value.collapsed};
    }
    return result;
  } catch {return {};}
}
export function mergeDriveNoticeMemory(previous:DriveNoticeMemory,checks:DriveNoticeCheck[]):DriveNoticeMemory {
  const next:DriveNoticeMemory={};
  for(const check of checks){
    // Only server-authorized sources survive. A failed check preserves a previous
    // full warning; only verified available space clears it.
    if(check.status==='FULL'||check.status==='UNKNOWN'&&previous[check.id]?.full)
      next[check.id]={full:true,collapsed:previous[check.id]?.collapsed||false};
  }
  return next;
}
