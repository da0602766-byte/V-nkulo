// Tipos compartilhados pela Gestão (CellManagementConsole) e pela
// Participação (CellMemberPortal). Espelham exatamente o que
// GET /api/pilot/celulas devolve — ver app/api/pilot/celulas/route.ts.

export type CellMember = {
  id: string;
  kind: "COMMUNITY" | "EXTERNAL";
  userId?: number;
  name: string;
  note?: string;
  role?: "LEADER" | "VICE_LEADER" | "MEMBER";
  email?: string;
  telefone?: string | null;
  fotoPerfil?: string | null;
  papelComunidade?: string;
};

export type CellAgendaItem = {
  id: number;
  titulo: string;
  inicia_em: string;
  termina_em: string;
  lembrete: string;
  visibilidade: "PUBLICO" | "PRIVADO";
};

export type CellReport = {
  id: number;
  data_reuniao: string;
  aconteceu: number;
  presentes: number;
  visitantes: number;
  observacoes: string;
  enviado_por_nome: string | null;
};

export type CellRequest = {
  id: number;
  nome: string;
  contato: string;
  mensagem: string;
  criado_em: string;
};

export type Cell = {
  id: number;
  nome: string;
  responsavel: string;
  observacoes: string | null;
  visitantes_ativos: number;
  dias_reuniao: string[];
  endereco_publico: string;
  descricao_publica: string;
  rede: string;
  horario_texto: string;
  temas: string[];
  foto_capa: string | null;
  lider_usuario_id: number | null;
  lider_nome: string | null;
  vice_lider_usuario_id: number | null;
  vice_lider_nome: string | null;
  ultimo_relatorio_em: string | null;
  arquivada_em: string | null;
  ativo: number;
  can_operate: boolean;
  // Papel da pessoa autenticada nesta célula, calculado no servidor sem
  // expor o restante dos integrantes a quem não opera a célula.
  minha_participacao: "LEADER" | "VICE_LEADER" | "MEMBER" | null;
  membros_total: number;
  membros: CellMember[];
  agenda: CellAgendaItem[];
  relatorios: CellReport[];
  solicitacoes: CellRequest[];
};

export type CellHealthId =
  | "AGUARDANDO"
  | "SEM_RELATORIO"
  | "ATENCAO"
  | "MULTIPLICAR"
  | "SAUDAVEL";

export type CellHealth = {
  id: CellHealthId;
  label: string;
  weeks: number[];
  semanasEmDia: number;
  mediaPresentes: number;
};

export type HighlightMessage = {
  titulo: string;
  mensagem: string;
  atualizadoEm: string | null;
  podeEditar: boolean;
};

export const DAY_ORDER = ["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SAB"] as const;
export const DAY_LABELS: Record<string, string> = {
  DOM: "Dom",
  SEG: "Seg",
  TER: "Ter",
  QUA: "Qua",
  QUI: "Qui",
  SEX: "Sex",
  SAB: "Sáb",
};
