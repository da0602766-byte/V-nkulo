import { getD1 } from "../../db";

export type MaintenanceConfig = {
  ativa?: boolean;
  mensagem?: string;
  iniciaEm?: string | null;
  terminaEm?: string | null;
};

export type MaintenanceState = {
  ativa: boolean;
  mensagem: string;
  iniciaEm: string | null;
  terminaEm: string | null;
};

export type DisplayMessage = {
  id: number;
  titulo: string;
  mensagem: string;
  tipo: string;
  areas: string;
  animacao: string;
  intervalo_segundos: number;
  inicia_em: string | null;
  termina_em: string | null;
  ativo: number;
  ativo_agora?: number;
  criado_em: string;
  atualizado_em: string;
};

export async function getMaintenanceState(): Promise<MaintenanceState> {
  const row = await getD1()
    .prepare("SELECT valor FROM configuracoes WHERE chave = 'manutencao' LIMIT 1")
    .first<{ valor: string }>();
  const config = parseJson<MaintenanceConfig>(row?.valor, {});
  const now = Date.now();
  const startsAt = parseDate(config.iniciaEm);
  const endsAt = parseDate(config.terminaEm);
  const withinWindow = (!startsAt || startsAt <= now) && (!endsAt || endsAt > now);
  return {
    ativa: Boolean(config.ativa) && withinWindow,
    mensagem:
      String(config.mensagem || "").trim() ||
      "O sistema está temporariamente em manutenção. Tente novamente mais tarde.",
    iniciaEm: config.iniciaEm || null,
    terminaEm: config.terminaEm || null,
  };
}

export async function getActiveLoginMessages() {
  const result = await getD1()
    .prepare(
      `SELECT m.*, 1 AS ativo_agora FROM mensagens_exibicao m
       WHERE m.ativo = 1
         AND (m.inicia_em IS NULL OR datetime(m.inicia_em) <= CURRENT_TIMESTAMP)
         AND (m.termina_em IS NULL OR datetime(m.termina_em) > CURRENT_TIMESTAMP)
         AND EXISTS (
           SELECT 1 FROM json_each(m.areas) area WHERE area.value = 'login'
         )
       ORDER BY CASE tipo WHEN 'URGENTE' THEN 0 WHEN 'IMPORTANTE' THEN 1 ELSE 2 END,
                m.criado_em DESC`,
    )
    .all<DisplayMessage>();
  return result.results;
}

export const ACTIVE_NOW_SQL = `CASE WHEN ativo = 1
  AND (inicia_em IS NULL OR datetime(inicia_em) <= CURRENT_TIMESTAMP)
  AND (termina_em IS NULL OR datetime(termina_em) > CURRENT_TIMESTAMP)
  THEN 1 ELSE 0 END`;

function parseDate(value?: string | null) {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseJson<T>(value: string | undefined, fallback: T): T {
  try {
    return value ? (JSON.parse(value) as T) : fallback;
  } catch {
    return fallback;
  }
}
