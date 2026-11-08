export type CalendarTaskStatus = 'PLANEJADO' | 'EM_ANDAMENTO' | 'BLOQUEADO' | 'CONCLUIDO';
export type CalendarItem = {
  id: string; camada: 'EVENTO' | 'ESCALA' | 'PESSOAL' | 'TAREFA'; origemId: number;
  titulo: string; descricao: string; iniciaEm: string | null; terminaEm: string | null;
  prazoEm?: string | null; local: string; diaInteiro: boolean; status: string;
  prioridade?: 'P1' | 'P2' | 'P3'; responsavelId?: number; responsavel?: string;
  visibilidade?: string; meu?: boolean; aprovacaoStatus?: string; versao?: number;
  podeEditar?: boolean; motivoBloqueio?: string;
};
export const TASK_STATUSES: Record<CalendarTaskStatus, string> = {
  PLANEJADO: 'Planejado', EM_ANDAMENTO: 'Em andamento', BLOQUEADO: 'Bloqueado', CONCLUIDO: 'Concluído',
};
export const SOURCE_LABELS = { EVENTO: 'Evento', ESCALA: 'Escala', PESSOAL: 'Compromisso', TAREFA: 'Tarefa' };
export function calendarDay(value: Date | string) {
  const date = typeof value === 'string' ? new Date(value) : value;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
export function calendarLocalInput(value: string | null | undefined) {
  if (!value) return '';
  const date = new Date(value);
  return `${calendarDay(date)}T${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}
export function calendarEnd(item: CalendarItem) {
  return item.terminaEm ? Date.parse(item.terminaEm) : Date.parse(item.iniciaEm || '') + 3600000;
}
export function calendarConflicts(items: CalendarItem[]) {
  const result = new Set<string>();
  const scheduled = items.filter(item => item.iniciaEm && item.responsavelId && !['CONCLUIDO', 'CANCELADO', 'INDISPONIVEL'].includes(item.status));
  for (let a = 0; a < scheduled.length; a++) for (let b = a + 1; b < scheduled.length; b++) {
    const x = scheduled[a], y = scheduled[b];
    if (x.responsavelId === y.responsavelId && Date.parse(x.iniciaEm!) < calendarEnd(y) && Date.parse(y.iniciaEm!) < calendarEnd(x)) {
      result.add(x.id); result.add(y.id);
    }
  }
  return result;
}
export function calendarNormalize(value: string) { return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(); }
