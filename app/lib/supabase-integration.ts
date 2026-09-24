import { getD1 } from "../../db";
import { getRuntimeEnv } from "../../db/runtime-env";

type Sealed = { iv: string; ciphertext: string; mask: string; length: number };
export type IntegrationCheck = {
  ok: boolean; checkedAt: string; latencyMs: number; authStatus: number;
  restStatus: number; storageStatus: number | null; bucketFound: boolean | null; message: string;
};
export type Integration = {
  ambiente: "PRODUCAO" | "HOMOLOGACAO"; url: string; projectRef: string;
  anonKey: string; schema: string; bucket: string; ativa: boolean;
  serviceRoleKey: Sealed | null; jwtSecret: Sealed | null;
  lastCheck?: IntegrationCheck | null;
};
export class IntegrationInputError extends Error {}
const KEY = "supabase_integration";
const encoder = new TextEncoder();
const encode = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const decode = (value: string) => Uint8Array.from(atob(value), c => c.charCodeAt(0));

async function encryptionKey() {
  const secret = getRuntimeEnv().AUTH_SECRET;
  if (!secret) throw new Error("Chave de proteção indisponível.");
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode("vinkulo:supabase:v1:" + secret));
  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, ["encrypt", "decrypt"]);
}
async function seal(value: string, context: string): Promise<Sealed> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({name:"AES-GCM", iv, additionalData:encoder.encode(context)}, await encryptionKey(), encoder.encode(value));
  return {iv:encode(iv), ciphertext:encode(new Uint8Array(ciphertext)), mask:"••••••••" + value.slice(-4), length:value.length};
}
export async function reveal(value: Sealed, context: string) {
  return new TextDecoder().decode(await crypto.subtle.decrypt({name:"AES-GCM", iv:decode(value.iv), additionalData:encoder.encode(context)}, await encryptionKey(), decode(value.ciphertext)));
}
export async function readIntegration() {
  const row = await getD1().prepare("SELECT valor, atualizado_por, atualizado_em FROM configuracoes WHERE chave = ?").bind(KEY).first<{valor:string; atualizado_por:string; atualizado_em:string}>();
  return row ? {config:JSON.parse(row.valor) as Integration, raw:row.valor, updatedBy:row.atualizado_por, updatedAt:row.atualizado_em} : null;
}
export function publicIntegration(config: Integration) {
  const {ambiente,url,projectRef,anonKey,schema,bucket,ativa} = config;
  const masked = (value: Sealed | null) => ({defined:Boolean(value), mask:value?.mask || "", length:value?.length || 0});
  return {ambiente,url,projectRef,anonKey,schema,bucket,ativa,serviceRoleKey:masked(config.serviceRoleKey),jwtSecret:masked(config.jwtSecret),lastCheck:config.lastCheck || null};
}
function text(value: unknown, max=4096) {
  if (typeof value !== "string" || value.length > max) throw new IntegrationInputError("Revise o formato e o tamanho dos campos.");
  return value.trim();
}
function jwtRole(value: string) {
  try { return JSON.parse(atob(value.split(".")[1].replaceAll("-","+").replaceAll("_","/"))).role; } catch { return null; }
}
export async function parseIntegration(payload: Record<string, unknown>, current: Integration | null): Promise<Integration> {
  const pick = (name: keyof Integration, fallback="") => text(payload[name] ?? current?.[name] ?? fallback);
  const url = pick("url");
  let parsed: URL;
  try { parsed = new URL(url); } catch { throw new IntegrationInputError("Informe uma URL HTTPS válida do projeto Supabase."); }
  if (parsed.protocol !== "https:" || !/^[a-z0-9-]+\.supabase\.co$/.test(parsed.hostname) || parsed.port || parsed.username || parsed.password || parsed.search || parsed.hash || parsed.pathname !== "/") {
    throw new IntegrationInputError("Use a URL HTTPS do projeto terminada em .supabase.co, sem caminho ou parâmetros.");
  }
  const ambiente = pick("ambiente");
  if (ambiente !== "PRODUCAO" && ambiente !== "HOMOLOGACAO") throw new IntegrationInputError("Selecione Produção ou Homologação.");
  const projectRef = pick("projectRef") || parsed.hostname.split(".")[0];
  const schema = pick("schema","public") || "public";
  const bucket = pick("bucket");
  if (!/^[a-z0-9-]+$/.test(projectRef) || !/^[a-z0-9_]+$/.test(schema) || (bucket && !/^[a-z0-9.-]+$/.test(bucket))) throw new IntegrationInputError("Revise a referência, o schema e o nome do bucket.");
  const anonKey = pick("anonKey");
  if (!/^sb_publishable_[A-Za-z0-9_-]{10,}$/.test(anonKey) && jwtRole(anonKey) !== "anon") throw new IntegrationInputError("Informe uma chave pública sb_publishable ou JWT anon válida.");
  const ativa = payload.ativa ?? current?.ativa ?? false;
  if (typeof ativa !== "boolean") throw new IntegrationInputError("Informe se a integração está ativa.");
  const origin = parsed.origin;
  async function secret(name: "serviceRoleKey" | "jwtSecret") {
    const value = payload[name] === undefined ? "" : text(payload[name]);
    const remove = payload[name === "serviceRoleKey" ? "removeServiceRoleKey" : "removeJwtSecret"];
    if (remove !== undefined && typeof remove !== "boolean") throw new IntegrationInputError("Confirmação de remoção inválida.");
    if (remove === true) return null;
    if (!value) {
      if (current?.[name] && current.url !== origin) throw new IntegrationInputError("Ao trocar o projeto, informe novamente os segredos para evitar enviar credenciais ao destino errado.");
      return current?.[name] || null;
    }
    if (value.length < 20 || (name === "serviceRoleKey" && !/^sb_secret_[A-Za-z0-9_-]{10,}$/.test(value) && jwtRole(value) !== "service_role")) throw new IntegrationInputError("Informe uma chave secreta de servidor válida.");
    return seal(value, origin + ":" + name);
  }
  const serviceRoleKey = await secret("serviceRoleKey");
  const jwtSecret = await secret("jwtSecret");
  if (!serviceRoleKey && (ativa || !current || payload.removeServiceRoleKey !== true)) throw new IntegrationInputError("Configure a chave secreta do servidor para salvar a integração.");
  return {ambiente,url:origin,projectRef,anonKey,schema,bucket,ativa,serviceRoleKey,jwtSecret,lastCheck:null};
}
export async function writeIntegration(config: Integration, userId: number) {
  await getD1().prepare("INSERT INTO configuracoes (chave, valor, atualizado_por, atualizado_em) VALUES (?, ?, ?, CURRENT_TIMESTAMP) ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor, atualizado_por = excluded.atualizado_por, atualizado_em = CURRENT_TIMESTAMP").bind(KEY,JSON.stringify(config),String(userId)).run();
}

async function checkedFetch(url: string, init: RequestInit) {
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
      // Workers accepts manual/follow. Keep credentials on the configured host;
      // callers reject non-success responses, including every redirect.
      const response = await fetch(url,{...init,redirect:"manual",cache:"no-store",signal:controller.signal});
      clearTimeout(timer);
      if (response.status < 500 || attempt === 1) return response;
    } catch (error) {
      clearTimeout(timer); lastError=error;
      if (attempt === 1) throw error;
    }
  }
  throw lastError || new Error("Falha de rede.");
}
export async function verifyIntegration(config: Integration): Promise<IntegrationCheck> {
  if (!config.ativa) throw new IntegrationInputError("Ative e salve a integração antes de testar a conexão.");
  const started=Date.now();
  try {
    if (!config.serviceRoleKey) throw new IntegrationInputError("Configure a chave secreta do servidor antes de testar.");
    const secret=await reveal(config.serviceRoleKey,config.url+":serviceRoleKey");
    const publicHeaders={apikey:config.anonKey};
    const secretHeaders={apikey:secret,Authorization:`Bearer ${secret}`};
    const [auth,publicSettings,rest]=await Promise.all([
      checkedFetch(config.url+"/auth/v1/health",{headers:publicHeaders}),
      checkedFetch(config.url+"/auth/v1/settings",{headers:publicHeaders}),
      checkedFetch(config.url+"/rest/v1/",{headers:{...secretHeaders,"Accept-Profile":config.schema}}),
    ]);
    if (auth.status === 402 || rest.status === 402) return result(false,"O projeto Supabase parece pausado ou indisponível.",auth.status,rest.status,null,null);
    if ([401,403].includes(publicSettings.status)) return result(false,"A chave pública foi recusada pelo Supabase.",publicSettings.status,rest.status,null,null);
    if ([401,403].includes(rest.status)) return result(false,"A chave secreta do servidor foi recusada pelo Supabase.",auth.status,rest.status,null,null);
    if (!auth.ok || !publicSettings.ok || !rest.ok) return result(false,"O Supabase respondeu, mas um dos serviços está com falha.",auth.status,rest.status,null,null);
    let storageStatus: number | null=null; let bucketFound: boolean | null=null;
    if (config.serviceRoleKey) {
      const storage=await checkedFetch(config.url+"/storage/v1/bucket",{headers:secretHeaders});
      storageStatus=storage.status;
      if ([401,403].includes(storage.status)) return result(false,"A chave secreta do servidor foi recusada pelo Supabase.",auth.status,rest.status,storage.status,false);
      if (!storage.ok) return result(false,"O serviço de Storage respondeu com falha.",auth.status,rest.status,storage.status,false);
      const buckets=await storage.json() as Array<{name?:string;id?:string}>;
      bucketFound=config.bucket ? buckets.some(item=>item.name===config.bucket || item.id===config.bucket) : null;
      if (config.bucket && !bucketFound) return result(false,`Conexão realizada, mas o bucket “${config.bucket}” não foi encontrado.`,auth.status,rest.status,storage.status,false);
    }
    return result(true,"Conexão verificada com Auth, REST e Storage.",auth.status,rest.status,storageStatus,bucketFound);
  } catch (error) {
    const aborted=error instanceof DOMException && error.name==="AbortError";
    return result(false,aborted ? "O Supabase não respondeu dentro de 8 segundos." : "Não foi possível alcançar o projeto Supabase. Confira a rede e a URL.",0,0,null,null);
  }
  function result(ok:boolean,message:string,authStatus:number,restStatus:number,storageStatus:number|null,bucketFound:boolean|null): IntegrationCheck {
    return {ok,checkedAt:new Date().toISOString(),latencyMs:Date.now()-started,authStatus,restStatus,storageStatus,bucketFound,message};
  }
}
