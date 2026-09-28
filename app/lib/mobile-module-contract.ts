// Versioned, closed contract. No arbitrary URL, table, audience or user identity
// comes from an offline client. The server derives identity from the session.
export const MODULES = ['requests','notes','followups','checklists','cells','parking'] as const;
export type MobileModule = typeof MODULES[number];
export const isMobileModule = (v: unknown): v is MobileModule => typeof v === 'string' && (MODULES as readonly string[]).includes(v);
export type ModulePayload = Record<string, string | number>;
export function modulePayload(module: MobileModule, value: unknown): ModulePayload | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>, p: ModulePayload = {};
  const definitions: Record<MobileModule, Record<string, number>> = {
    requests: {tipo:30,titulo:120,descricao:2000,visibilidade:20},
    notes: {titulo:100,texto:1200,cor:10},
    followups: {visitanteId:0,tipo:20,resultado:160,descricao:1500,proximoContato:10},
    checklists: {itemId:0,version:0,status:20,observacao:600},
    cells: {celulaId:0,data:10,observacoes:1000},
    parking: {tipo:20,gravidade:10,descricao:1200},
  };
  const fields = definitions[module];
  if (Object.keys(v).length !== Object.keys(fields).length) return null;
  for (const [k, max] of Object.entries(fields)) {
    const raw = v[k];
    if (!max) {
      if (typeof raw !== 'number' || !Number.isSafeInteger(raw) || raw < (k === 'version' ? 0 : 1)) return null;
      p[k] = raw;
    } else {
      if (typeof raw !== 'string' || raw.length > max || /[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(raw)) return null;
      p[k] = raw.trim();
    }
  }
  const choice = (k: string, values: string[]) => values.includes(String(p[k]));
  const length = (k: string, min: number) => String(p[k]).length >= min;
  const date = (k: string) => !p[k] || (/^\d{4}-\d{2}-\d{2}$/.test(String(p[k])) && !isNaN(Date.parse(String(p[k]))) && new Date(String(p[k])).toISOString().slice(0,10) === p[k]);
  if (module === 'requests' && (!choice('tipo',['ORACAO','VISITA','ACONSELHAMENTO','APOIO','MINISTERIO','OUTRO','INFORMACAO']) || !choice('visibilidade',['PASTORAL','GESTORES','PRIVADA']) || !length('titulo',3) || !length('descricao',10))) return null;
  if (module === 'notes' && ((!length('titulo',1) && !length('texto',1)) || !choice('cor',['amarelo','rosa','azul','verde']))) return null;
  if (module === 'followups' && (!choice('tipo',['WHATSAPP','TELEFONE','PRESENCIAL','EMAIL','OUTRO']) || !length('resultado',1) || !date('proximoContato'))) return null;
  if (module === 'checklists' && !choice('status',['PENDENTE','FEITO','NAO_FEITO'])) return null;
  if (module === 'parking' && (!choice('tipo',['SEGURANCA','DANO','BLOQUEIO','ORIENTACAO','OUTRO']) || !choice('gravidade',['BAIXA','MEDIA','ALTA']) || !length('descricao',8))) return null;
  if (module === 'cells' && (!length('data',10) || !date('data'))) return null;
  return p;
}
