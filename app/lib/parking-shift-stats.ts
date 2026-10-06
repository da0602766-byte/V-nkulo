import type { getD1 } from "../../db";

/** Counts the full persisted interval, independently of paginated operator lists. */
export async function readParkingShiftStats(db: ReturnType<typeof getD1>, communityId: number, start: string, end: string) {
  const row = await db.prepare(`SELECT
    (SELECT COUNT(*) FROM estacionamento_movimentacoes WHERE comunidade_id=? AND datetime(entrada_em)>=datetime(?) AND datetime(entrada_em)<=datetime(?)) AS entradas,
    (SELECT COUNT(*) FROM estacionamento_movimentacoes WHERE comunidade_id=? AND datetime(saida_em)>=datetime(?) AND datetime(saida_em)<=datetime(?)) AS saidas,
    (SELECT COUNT(*) FROM estacionamento_ocorrencias WHERE comunidade_id=? AND datetime(criado_em)>=datetime(?) AND datetime(criado_em)<=datetime(?)) AS ocorrencias`)
    .bind(communityId,start,end,communityId,start,end,communityId,start,end)
    .first<{entradas:number;saidas:number;ocorrencias:number}>();
  return row || {entradas:0,saidas:0,ocorrencias:0};
}
