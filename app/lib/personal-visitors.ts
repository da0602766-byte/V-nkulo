// Shared by the browser and the personal Drive endpoint. No community-list IDs
// or storage pointers are accepted in a personal document.
export type PersonalRow = Record<string,string|number|null>;
export type PersonalContact = {id:number;visitante_id:number;tipo:string;resultado:string;descricao:string;proximo_contato:string;criado_em:string;responsavel_email:string};
export type PersonalEvent = {id:number;message:string;at:string};
export type PersonalVisitors = {format:'vinkulo-personal-visitors';version:1;userId:number;communityId:number;revision:number;nextId:number;people:PersonalRow[];contacts:PersonalContact[];events:PersonalEvent[]};
export const PERSONAL_MAX_BYTES=4*1024*1024;
export function emptyPersonalVisitors(userId:number,communityId:number):PersonalVisitors {
  return {format:'vinkulo-personal-visitors',version:1,userId,communityId,revision:0,nextId:1,people:[],contacts:[],events:[]};
}
const columns:Record<string,[string,number]>={nomeCompleto:['nome_completo',120],dataNascimento:['data_nascimento',10],telefone:['telefone',30],email:['email',180],dataEntrada:['data_entrada',10],tipoPessoa:['tipo_pessoa',20],endereco:['endereco',250],acompanhante:['acompanhante',120],parente:['parente',120],status:['status',30],categoriaNome:['categoria_nome',120],celulaNome:['celula_nome',120],ministerio:['ministerio',120],batizado:['batizado',20],certificadoBatismo:['certificado_batismo',20],discipulado:['discipulado',20],discipulador:['discipulador',120],oficial:['oficial',20],funcaoOficial:['funcao_oficial',120],doaADoa:['doa_a_doa',20],doaReceber:['doa_receber',20],doacoesRealizadas:['doacoes_realizadas',1500],responsavelAcompanhamento:['responsavel_acompanhamento',120],dataProximaAcao:['data_proxima_acao',10],proximaAcao:['proxima_acao',300],observacoes:['observacoes',1000]};
const validDate=(v:unknown)=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v;
export function personalPerson(body:Record<string,unknown>,id:number,previous?:PersonalRow):PersonalRow {
  const row:PersonalRow={id,ativo:previous?.ativo??1};
  for(const [key,[column,max]] of Object.entries(columns)) {
    const value=String(body[key]??previous?.[column]??'').trim();
    if(value.length>max)throw new Error('Um dos campos excede o tamanho permitido.');
    row[column]=value;
  }
  if(!row.nome_completo||!validDate(row.data_entrada))throw new Error('Informe o nome e uma data de chegada válida.');
  for(const field of ['data_nascimento','data_proxima_acao'])if(row[field]&&!validDate(row[field]))throw new Error('Confira as datas informadas.');
  if(row.email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(row.email)))throw new Error('Informe um e-mail válido.');
  row.status=row.status||'NOVO';row.tipo_pessoa=row.tipo_pessoa||'VISITANTE';
  if(!['NOVO','EM_CONTATO','EM_ACOMPANHAMENTO','INTEGRADO'].includes(String(row.status))||!['VISITANTE','MEMBRO'].includes(String(row.tipo_pessoa)))throw new Error('Status ou vínculo inválido.');
  for(const column of ['batizado','certificado_batismo','discipulado','oficial','doa_a_doa','doa_receber']) {
    row[column]=row[column]||'NAO_INFORMADO';
    if(!['SIM','NAO','NAO_INFORMADO'].includes(String(row[column])))throw new Error('Confira as respostas da ficha.');
  }
  if(row.discipulado==='SIM'&&!row.discipulador)throw new Error('Informe quem acompanha o discipulado.');
  if(row.oficial==='SIM'&&!row.funcao_oficial)throw new Error('Informe a função do oficial.');
  for(const [key,column] of [['encontroComDeus','encontro_com_deus'],['cursoMembros','curso_membros']])row[column]=key in body?(body[key]===true?1:0):(previous?.[column]||0);
  row.ultimo_contato=previous?.ultimo_contato||'';row.proximo_contato=previous?.proximo_contato||'';
  return row;
}
export function validatePersonalVisitors(value:unknown,userId:number,communityId:number):asserts value is PersonalVisitors {
  const d=value as PersonalVisitors;
  if(!d||d.format!=='vinkulo-personal-visitors'||d.version!==1||d.userId!==userId||d.communityId!==communityId)throw new Error('Este backup pertence a outra conta ou comunidade.');
  if(!Number.isSafeInteger(d.revision)||d.revision<0||!Number.isSafeInteger(d.nextId)||d.nextId<1||!Array.isArray(d.people)||!Array.isArray(d.contacts)||!Array.isArray(d.events)||d.people.length>5000||d.contacts.length>20000||d.events.length>5000)throw new Error('Arquivo de visitantes inválido ou acima do limite.');
  if(new TextEncoder().encode(JSON.stringify(d)).length>PERSONAL_MAX_BYTES)throw new Error('A lista excede o limite de 4 MB.');
  const ids=new Set<number>();let maxId=0;
  const claim=(id:number)=>{if(!Number.isSafeInteger(id)||id<1||ids.has(id))throw new Error('Identificador inválido no backup.');ids.add(id);maxId=Math.max(maxId,id);};
  const peopleIds=new Set<number>();
  for(const p of d.people) {
    if(!p||Object.values(p).some(v=>v!==null&&!['number','string'].includes(typeof v)))throw new Error('Ficha inválida no backup.');
    claim(Number(p.id));peopleIds.add(Number(p.id));
    personalPerson({},Number(p.id),p);
    if(![0,1].includes(Number(p.ativo)))throw new Error('Estado da ficha inválido.');
  }
  for(const c of d.contacts) {
    if(!c||typeof c!=='object')throw new Error('Contato inválido no backup.');
    claim(c.id);
    if(!peopleIds.has(c.visitante_id)||!['WHATSAPP','TELEFONE','PRESENCIAL','VISITA','EMAIL','OUTRO'].includes(c.tipo)||!c.resultado||typeof c.resultado!=='string'||c.resultado.length>300||typeof c.descricao!=='string'||c.descricao.length>2000||typeof c.responsavel_email!=='string'||c.responsavel_email.length>180||!Number.isFinite(Date.parse(c.criado_em))||(c.proximo_contato&&!validDate(c.proximo_contato)))throw new Error('Contato inválido no backup.');
  }
  for(const e of d.events){if(!e||typeof e!=='object')throw new Error('Histórico inválido no backup.');claim(e.id);if(typeof e.message!=='string'||e.message.length>300||!Number.isFinite(Date.parse(e.at)))throw new Error('Histórico inválido no backup.');}
  if(d.nextId<=maxId)throw new Error('Sequência inválida no backup.');
}
export function personalEvent(doc:PersonalVisitors,message:string) {
  doc.events=doc.events.filter(e=>Date.parse(e.at)>Date.now()-30*86400000).slice(-4999);
  doc.events.push({id:doc.nextId++,message,at:new Date().toISOString()});
}
export function savePersonalPerson(doc:PersonalVisitors,body:Record<string,unknown>,id?:number) {
  const previous=id?doc.people.find(p=>p.id===id):undefined;
  if(id&&!previous)throw new Error('A ficha não está mais nesta lista. Atualize.');
  const row=personalPerson(body,id||doc.nextId,previous);
  const duplicate=doc.people.find(p=>p.id!==row.id&&((String(p.nome_completo).toLocaleLowerCase()===String(row.nome_completo).toLocaleLowerCase())||(row.telefone&&String(p.telefone).replace(/\D/g,'')===String(row.telefone).replace(/\D/g,''))));
  if(duplicate&&body.confirmarDuplicidade!==true)throw Object.assign(new Error('Há uma ficha semelhante. Confira antes de criar outra.'),{duplicates:[duplicate]});
  if(!previous){doc.nextId++;doc.people.push(row);}else doc.people=doc.people.map(p=>p.id===id?row:p);
  personalEvent(doc,`${previous?'Cadastro atualizado':'Cadastro criado'}: ${row.nome_completo}`);
  return Number(row.id);
}
export function changePersonalPeople(doc:PersonalVisitors,ids:number[],action:'arquivar'|'excluir'|'reativar'|'concluir') {
  if(ids.some(id=>!doc.people.some(p=>p.id===id)))throw new Error('Uma ficha foi alterada. Atualize a lista.');
  const selected=new Set(ids);
  if(action==='excluir'){doc.people=doc.people.filter(p=>!selected.has(Number(p.id)));doc.contacts=doc.contacts.filter(c=>!selected.has(c.visitante_id));}
  else for(const p of doc.people.filter(p=>selected.has(Number(p.id)))){
    if(action==='concluir'){p.proxima_acao='';p.data_proxima_acao='';}
    else {p.ativo=action==='arquivar'?0:1;if(action==='reativar')p.status='EM_ACOMPANHAMENTO';}
  }
  personalEvent(doc,`${ids.length} ficha(s): ${{arquivar:'arquivada(s)',excluir:'excluída(s)',reativar:'reativada(s)',concluir:'próxima ação concluída'}[action]}.`);
}
export function addPersonalContact(doc:PersonalVisitors,body:Record<string,unknown>,author:string) {
  const p=doc.people.find(p=>p.id===Number(body.visitanteId));if(!p)throw new Error('Ficha não encontrada.');
  const c:PersonalContact={id:doc.nextId++,visitante_id:Number(p.id),tipo:String(body.tipo||''),resultado:String(body.resultado||'').trim(),descricao:String(body.descricao||'').trim(),proximo_contato:String(body.proximoContato||''),criado_em:new Date().toISOString().slice(0,19).replace('T',' '),responsavel_email:author};
  doc.contacts.push(c);p.ultimo_contato=c.criado_em;p.proximo_contato=c.proximo_contato;p.status='EM_ACOMPANHAMENTO';
  personalEvent(doc,`Contato registrado: ${p.nome_completo}`);
  validatePersonalVisitors(doc,doc.userId,doc.communityId);
}
