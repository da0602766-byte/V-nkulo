import { getD1 } from "../../db";
import { readIntegration, reveal } from "./supabase-integration";
import { previewProfiles } from "./supabase-profile-catalog";

type SourceRow = {
  id: number; perfil: string; permissoes: string; foto_perfil: string | null;
  telefone: string | null; cadastro_dados: string; data_nascimento: string | null;
  endereco: string | null; celula: string | null; ministerio: string | null;
  observacoes: string | null; nome_pais: string | null; diaconia_equipe_id: number | null;
  tema_preferido: string; titulo_eclesiastico: string; atualizado_em: string;
};
type Details = {
  profile_role: string; permissions: string; profile_photo: string | null;
  phone: string | null; registration_data: Record<string, unknown>;
  birth_date: string | null; address: string | null; cell: string | null;
  ministry: string | null; notes: string | null; parent_name: string | null;
  deacon_team_id: number | null; theme: string; church_title: string;
};
export type ProfileDetailsItem = { legacy_d1_id: number; details: Details; source_updated_at: string };
export type ProfileDetailsPreview = { sourceCount: number; destinationCount: number; matchedCount: number;
  pendingCount: number; extraDestinationCount: number; ready: boolean };
type SyncResult = { run_id: string; source_count: number; inserted_count: number;
  updated_count: number; unchanged_count: number };

export class ProfileDetailsError extends Error {
  constructor(message: string, public readonly status = 424) { super(message); }
}

function timestamp(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?$/.test(value)) {
    throw new ProfileDetailsError("Há uma data de alteração inválida no D1.", 422);
  }
  const date = new Date(/(?:Z|[+-]\d{2}:?\d{2})$/.test(value) ? value : `${value.replace(" ", "T")}Z`);
  if (Number.isNaN(date.getTime())) throw new ProfileDetailsError("Há uma data de alteração inválida no D1.", 422);
  return date.toISOString();
}

function bounded(value: unknown, max: number): string | null {
  if (value == null) return null;
  if (typeof value !== "string" || value.length > max) throw new ProfileDetailsError("Há um campo cadastral incompatível no D1.", 422);
  return value;
}

function assertNoCredentialFields(value: unknown, depth = 0) {
  if (depth > 8) throw new ProfileDetailsError("Há dados de cadastro profundos demais para conferir.", 422);
  if (!value || typeof value !== "object") return;
  for (const [key, item] of Object.entries(value)) {
    if (/operacao|token|senha|password|secret|session|sessao|cpf_hash/i.test(key)) {
      throw new ProfileDetailsError("Há um marcador ou credencial no cadastro. Revise o registro antes da transferência.", 409);
    }
    assertNoCredentialFields(item, depth + 1);
  }
}

export async function loadSourceProfileDetails(): Promise<ProfileDetailsItem[]> {
  const result = await getD1().prepare(`SELECT id,perfil,permissoes,foto_perfil,telefone,cadastro_dados,
    data_nascimento,endereco,celula,ministerio,observacoes,nome_pais,diaconia_equipe_id,
    tema_preferido,titulo_eclesiastico,atualizado_em FROM usuarios ORDER BY id LIMIT 1001`).all<SourceRow>();
  if (result.results.length > 1000) throw new ProfileDetailsError("Há mais de 1.000 perfis; divida a migração em lotes controlados.", 422);
  return result.results.map(row => {
    if (!Number.isSafeInteger(row.id) || row.id < 1 ||
      (row.diaconia_equipe_id != null && (!Number.isSafeInteger(row.diaconia_equipe_id) || row.diaconia_equipe_id < 1))) {
      throw new ProfileDetailsError("Há um identificador cadastral incompatível no D1.", 422);
    }
    let registrationData: unknown;
    try { registrationData = JSON.parse(row.cadastro_dados || "{}"); }
    catch { throw new ProfileDetailsError("Há dados de cadastro em formato inválido no D1.", 422); }
    if (!registrationData || typeof registrationData !== "object" || Array.isArray(registrationData)
      || JSON.stringify(registrationData).length > 16_000) {
      throw new ProfileDetailsError("Há dados de cadastro incompatíveis no D1.", 422);
    }
    assertNoCredentialFields(registrationData);
    const profilePhoto = bounded(row.foto_perfil, 2048);
    if (profilePhoto?.startsWith("data:")) {
      throw new ProfileDetailsError("Há foto incorporada ao cadastro. Migre o arquivo antes de copiar os detalhes.", 409);
    }
    const details: Details = {
      profile_role: bounded(row.perfil, 64) || "",
      permissions: bounded(row.permissoes, 4096) || "",
      profile_photo: profilePhoto,
      phone: bounded(row.telefone, 80),
      registration_data: registrationData as Record<string, unknown>,
      birth_date: bounded(row.data_nascimento, 40),
      address: bounded(row.endereco, 2000),
      cell: bounded(row.celula, 180),
      ministry: bounded(row.ministerio, 180),
      notes: bounded(row.observacoes, 5000),
      parent_name: bounded(row.nome_pais, 180),
      deacon_team_id: row.diaconia_equipe_id,
      theme: bounded(row.tema_preferido, 40) || "",
      church_title: bounded(row.titulo_eclesiastico, 100) || "",
    };
    return { legacy_d1_id: row.id, details, source_updated_at: timestamp(row.atualizado_em) };
  });
}

async function rpc<T>(name: string, body: Record<string, unknown>): Promise<T> {
  const saved = await readIntegration();
  if (!saved?.config.ativa || !saved.config.serviceRoleKey) throw new ProfileDetailsError("Ative a integração Supabase antes de comparar os detalhes.", 409);
  const secret = await reveal(saved.config.serviceRoleKey, `${saved.config.url}:serviceRoleKey`);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  try {
    const response = await fetch(`${saved.config.url}/rest/v1/rpc/${name}`, {
      method: "POST", headers: { apikey: secret, Authorization: `Bearer ${secret}`,
        "Content-Type": "application/json", "Accept-Profile": saved.config.schema, "Content-Profile": saved.config.schema },
      body: JSON.stringify(body), cache: "no-store", redirect: "manual", signal: controller.signal,
    });
    if (!response.ok) throw new ProfileDetailsError(response.status === 404
      ? "A migração SQL dos detalhes de perfis ainda não foi aplicada no Supabase."
      : `O Supabase recusou os detalhes de perfis (HTTP ${response.status}).`, response.status === 409 ? 409 : 424);
    return await response.json() as T;
  } catch (error) {
    if (error instanceof ProfileDetailsError) throw error;
    if (error instanceof DOMException && error.name === "AbortError") throw new ProfileDetailsError("O Supabase não respondeu em 20 segundos.", 504);
    throw new ProfileDetailsError("Não foi possível consultar os detalhes de perfis no Supabase.", 503);
  } finally { clearTimeout(timer); }
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

export async function previewProfileDetails(sourceInput?: ProfileDetailsItem[]): Promise<ProfileDetailsPreview> {
  const source = sourceInput ?? await loadSourceProfileDetails();
  if (!(await previewProfiles()).ready) throw new ProfileDetailsError("Conclua a conciliação dos perfis mínimos antes dos dados cadastrais.", 409);
  const destination = await rpc<ProfileDetailsItem[]>("vinkulo_profile_details_snapshot", {});
  if (!Array.isArray(destination) || destination.length > 1000) throw new ProfileDetailsError("O Supabase devolveu detalhes incompatíveis.");
  const sourceIds = new Set(source.map(item => item.legacy_d1_id));
  const destinationById = new Map(destination.map(item => [Number(item.legacy_d1_id), item]));
  if (destinationById.size !== destination.length) throw new ProfileDetailsError("Há IDs duplicados no destino.");
  const matchedCount = source.filter(item => {
    const remote = destinationById.get(item.legacy_d1_id);
    return remote && canonical(remote.details) === canonical(item.details)
      && timestamp(remote.source_updated_at) === item.source_updated_at;
  }).length;
  const extraDestinationCount = destination.filter(item => !sourceIds.has(Number(item.legacy_d1_id))).length;
  return { sourceCount: source.length, destinationCount: destination.length, matchedCount,
    pendingCount: source.length - matchedCount, extraDestinationCount,
    ready: matchedCount === source.length && extraDestinationCount === 0 };
}

export async function syncProfileDetails(source: ProfileDetailsItem[], actorId: number) {
  if (!Number.isSafeInteger(actorId) || actorId < 1) throw new ProfileDetailsError("Responsável inválido.", 400);
  const result = await rpc<SyncResult[]>("vinkulo_sync_profile_details", { payload: source, actor_legacy_d1_id: actorId });
  const run = Array.isArray(result) ? result[0] : null;
  if (!run?.run_id || run.source_count !== source.length) throw new ProfileDetailsError("O Supabase não confirmou os detalhes de perfis.");
  return run;
}

export async function remoteProfileDetailsCount(): Promise<number> {
  const destination = await rpc<ProfileDetailsItem[]>("vinkulo_profile_details_snapshot", {});
  if (!Array.isArray(destination) || destination.length > 1000) throw new ProfileDetailsError("O Supabase devolveu detalhes incompatíveis.");
  return destination.length;
}

export async function clearRemoteProfileDetails(actorId: number): Promise<number> {
  if (!Number.isSafeInteger(actorId) || actorId < 1) throw new ProfileDetailsError("Responsável inválido.", 400);
  const result = await rpc<Array<{ deleted_count: number }>>("vinkulo_clear_profile_details", { actor_legacy_d1_id: actorId });
  const deleted = Array.isArray(result) ? result[0]?.deleted_count : null;
  if (!Number.isSafeInteger(deleted) || Number(deleted) < 0) throw new ProfileDetailsError("O Supabase não confirmou a remoção dos dados cadastrais.");
  return Number(deleted);
}
