import { visitorAge } from "../../lib/visitor-care";
export type Status = 'Novo' | 'Em contato' | 'Em acompanhamento' | 'Integrado';
export type Tri = 'Sim' | 'Não' | 'Não informado';
export type Raw = Record<string, string | number | null>;
export type Named = {id:number; nome:string};
export type Categoria = {id:number; nome:string; descricao:string; responsavel?:string; ministerio?:string; idadeMin?:number; idadeMax?:number; indicadores:boolean; raw:Raw};
export type Pessoa = {id:string; nome:string; telefone?:string; email?:string; nascimento?:string; tipo:'Visitante'|'Membro'; categoria?:string; ministerio?:string; celula?:string; responsavel?:string; recebeu?:string; status:Status; entrada:string; proximaAcao?:string; prazo?:string; arquivado:boolean; discipulado:Tri; certificado:Tri; apoio:Tri; batizado:Tri; observacoes?:string; ultimo?:string; retorno?:string; raw:Raw};
export type PerfilConfig = {papel:string; podeCriarPessoa:boolean; podeEditarPessoa:boolean; podeArquivar:boolean; podeExcluir:boolean; podeRegistrarContato:boolean; podeEditarCategorias:boolean; podeImportarExportar:boolean};
export const statuses: Record<string, Status> = {NOVO:'Novo', EM_CONTATO:'Em contato', EM_ACOMPANHAMENTO:'Em acompanhamento', INTEGRADO:'Integrado'};
export const answer = (v:unknown):Tri => v === 'SIM' ? 'Sim' : v === 'NAO' ? 'Não' : 'Não informado';
export const today = () => new Intl.DateTimeFormat('en-CA', {timeZone:'America/Sao_Paulo'}).format(new Date());
export const age = (n?:string) => visitorAge(n || null, today()) ?? undefined;
const text = (v:unknown) => v === null || v === undefined || v === '' ? undefined : String(v);
export function person(v:Raw):Pessoa { return {id:String(v.id),nome:String(v.nome_completo),telefone:text(v.telefone),email:text(v.email),nascimento:text(v.data_nascimento),tipo:v.tipo_pessoa==='MEMBRO'?'Membro':'Visitante',categoria:text(v.categoria_nome),ministerio:text(v.ministerio_categoria)||text(v.ministerio),celula:text(v.celula_nome),responsavel:text(v.responsavel_acompanhamento),recebeu:text(v.acompanhante),status:statuses[String(v.status)] || 'Novo',entrada:String(v.data_entrada),proximaAcao:text(v.proxima_acao),prazo:text(v.data_proxima_acao),arquivado:!v.ativo,discipulado:answer(v.discipulado),certificado:answer(v.certificado_batismo),apoio:answer(v.doa_receber),batizado:answer(v.batizado),observacoes:text(v.observacoes),ultimo:text(v.ultimo_contato),retorno:text(v.proximo_contato),raw:v}; }
export function category(c:Raw):Categoria {return {id:Number(c.id),nome:String(c.nome),descricao:String(c.descricao||''),responsavel:text(c.responsavel_nome),ministerio:text(c.ministerio_nome),idadeMin:c.idade_minima==null?undefined:Number(c.idade_minima),idadeMax:c.idade_maxima==null?undefined:Number(c.idade_maxima),indicadores:!!c.exibir_dashboard,raw:c};}
export async function api<T>(url:string, method='GET', body?:unknown):Promise<T> {
  const revision=(body as {_visitorRevision?:number}|undefined)?._visitorRevision;
  const response=await fetch(url,{method,cache:'no-store',signal:method==='GET'?AbortSignal.timeout(60000):undefined,headers:body?{'Content-Type':'application/json',...(revision!==undefined?{'X-Vinkulo-Visitor-Revision':String(revision)}:{})}:undefined,body:body?JSON.stringify(body):undefined}).catch(error=>{
    if(error.name==='TimeoutError')throw new Error('A consulta demorou mais que o esperado. Verifique sua conexão e tente novamente.');
    throw new Error('Não foi possível conectar ao Vínkulo. Verifique sua conexão e tente novamente.');
  });
  const result=await response.json().catch(()=>({error:'Não foi possível ler a resposta. Tente novamente.'}));
  if(!response.ok) throw Object.assign(new Error(result.error||'Não foi possível concluir.'),{duplicates:result.duplicados,status:response.status});
  return result;
}
export function whatsapp(phone?:string) {const digits=(phone||'').replace(/\D/g,''); return digits.length===10||digits.length===11?'55'+digits:digits;}
