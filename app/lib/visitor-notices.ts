/** Rules use only the authorized visitor snapshot, never global notifications. */
export type CarePerson = {
  id:string; nome:string; arquivado:boolean; categoria?:string; responsavel?:string;
  telefone?:string; email?:string; ultimo?:string; entrada:string; retorno?:string;
  prazo?:string; proximaAcao?:string; status:string; celula?:string; ministerio?:string;
  discipulado:string; batizado:string; certificado:string; apoio:string;
};
export type CareCategory = {nome:string; responsavel?:string};
export type CareReason = {group:'atrasado'|'hoje'|'proximos'|'cuidado'|'cadastro'|'integracao'; text:string};
export type CareNotice = {person:CarePerson; reasons:CareReason[]; priority:number};
export const noticeGroups = [
  {id:'atrasado',label:'Atrasados'}, {id:'hoje',label:'Hoje'}, {id:'proximos',label:'Próximos 7 dias'},
  {id:'cuidado',label:'Cuidados'}, {id:'cadastro',label:'Cadastro'}, {id:'integracao',label:'Integração'},
] as const;
const day = (v?:string) => v?.slice(0,10) || '';
const days = (a:string,b:string) => Math.floor((Date.parse(b)-Date.parse(a))/86400000);
export function buildVisitorNotices(people:CarePerson[], categories:CareCategory[], today:string, canViewFollowups=true):CareNotice[] {
  return people.filter(p=>!p.arquivado).map(person=>{
    const reasons:CareReason[]=[];
    const add=(group:CareReason['group'],text:string)=>reasons.push({group,text});
    const dated=(date:string|undefined,label:string)=>{
      const d=day(date);if(!d||!Number.isFinite(Date.parse(d)))return;
      const distance=days(today,d), formatted=d.split('-').reverse().join('/');
      if(distance<0)add('atrasado',`${label} atrasado · ${formatted}`);
      else if(distance===0)add('hoje',`${label} para hoje`);
      else if(distance<=7)add('proximos',`${label} em ${formatted}`);
    };
    dated(person.prazo,'Prazo da próxima ação');
    if(canViewFollowups){
      dated(person.retorno,'Retorno');
      if(!person.ultimo&&person.status==='Novo')add('cuidado','Primeiro contato ainda não registrado');
      let reference=day(person.entrada);
      if(person.ultimo){
        const raw=person.ultimo;const timestamp=new Date(/[zZ]|[+-]\d{2}:?\d{2}$/.test(raw)?raw:`${raw.replace(' ','T')}Z`);
        if(Number.isFinite(timestamp.getTime()))reference=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(timestamp);
      }
      if(days(reference,today)>=15)add('cuidado','Sem contato há 15 dias ou mais');
    }
    if(!person.responsavel?.trim()&&!categories.find(c=>c.nome===person.categoria)?.responsavel?.trim())add('cuidado','Sem responsável pelo acompanhamento');
    if(person.apoio==='Sim')add('cuidado','Solicitou apoio social · verificar atendimento');
    if(person.proximaAcao&&!person.prazo)add('cuidado','Próxima ação sem prazo');
    if(person.prazo&&!person.proximaAcao)add('cuidado','Prazo definido sem descrever a próxima ação');
    if(!person.categoria)add('cadastro','Sem categoria');
    if(!person.telefone?.trim())add('cadastro',person.email?.trim()?'Sem telefone · e-mail disponível':'Sem telefone nem e-mail');
    if(!person.celula)add('integracao','Vínculo com célula a confirmar');
    if(!person.ministerio)add('integracao','Vínculo com ministério a confirmar');
    if(person.discipulado!=='Sim')add('integracao','Discipulado a confirmar');
    if(person.batizado==='Sim'&&person.certificado!=='Sim')add('integracao','Certificado de batismo a confirmar');
    reasons.sort((a,b)=>noticeGroups.findIndex(g=>g.id===a.group)-noticeGroups.findIndex(g=>g.id===b.group));
    const priority=Math.min(...reasons.map(r=>noticeGroups.findIndex(g=>g.id===r.group)));
    return {person,reasons,priority};
  }).filter(n=>n.reasons.length).sort((a,b)=>a.priority-b.priority||a.person.nome.localeCompare(b.person.nome,'pt-BR'));
}
export type VisitorCareNote = {id:string; titulo:string; visitanteId:number|null; visitanteNome:string; lembreteEm?:string|null; checklist:{concluido:boolean}[]};
export function relevantVisitorNotes(notes:VisitorCareNote[],people:CarePerson[],today:string){
  const activeIds=new Set(people.filter(p=>!p.arquivado).map(p=>p.id));
  return notes.filter(n=>n.visitanteId!=null&&activeIds.has(String(n.visitanteId))&&(
    n.checklist.some(i=>!i.concluido)||(n.lembreteEm&&Number.isFinite(Date.parse(n.lembreteEm))&&new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(n.lembreteEm))<=today)
  ));
}
