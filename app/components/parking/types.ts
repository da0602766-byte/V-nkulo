export type Space = {
  id: number;
  codigo: string;
  tipo: string;
  status: string;
  setor_id: number;
  setor_nome: string;
  setor_cor: string;
  ordem: number;
  posicao_x: number;
  posicao_y: number;
  reservada?: boolean | number;
  minha_reserva?: boolean | number;
  atualizado_em?: string;
};

export type Reservation = {
  id: number;
  vaga_id: number;
  evento_id: number | null;
  evento_titulo: string;
  nome_completo: string;
  email: string;
  telefone: string;
  placa_veiculo: string;
  tipo_veiculo: string;
  modelo_veiculo: string;
  cor_veiculo: string;
  documento_mascarado: string;
  inicio_em: string;
  fim_em: string;
  codigo?: string;
  status: string;
  checkin_em: string | null;
  saida_em?: string | null;
  setor_id?: number;
  vaga_tipo?: string;
  vaga_codigo: string;
  setor_nome: string;
};

export type ParkingEventOption = {
  id: number;
  titulo: string;
  inicia_em: string;
  termina_em: string | null;
  local: string;
  status: string;
};

export type ParkingReport = {
  id: number;
  escala_id: number;
  usuario_id: number;
  membro_nome: string;
  titulo: string;
  inicia_em: string;
  termina_em: string;
  resumo: string;
  motivo_correcao: string;
  pode_revisar: number;
  proprio: number;
  entradas: number;
  saidas: number;
  ocorrencias: number;
  status: string;
};

export type Movement = {
  id: number;
  vaga_id?: number;
  placa: string;
  tipo_veiculo: string;
  responsavel: string;
  vinculo: string;
  entrada_em: string;
  saida_em: string | null;
  status: string;
  vaga_codigo: string | null;
  setor_nome: string | null;
  operador_nome: string | null;
};

export type Occurrence = {
  id: number;
  tipo: string;
  descricao: string;
  gravidade: string;
  status: string;
  criado_em: string;
  criado_por_nome: string | null;
};

export type AvailableUser = { id: number; nome: string; papel: string };
export type MinistryMember = { id: number; nome: string; papel: string };

export type ParkingData = {
  reservasVagas?: Array<Pick<Reservation,"id"|"vaga_id"|"evento_titulo"|"nome_completo"|"placa_veiculo"|"tipo_veiculo"|"modelo_veiculo"|"cor_veiculo"|"inicio_em"|"fim_em"|"status"> & {total:number}>;
  eventos?: ParkingEventOption[];
  serverTime?: string;
  context?: { eventoId: number | null; inicioEm: string; fimEm: string };
  reservationGate?: {
    unlocked: boolean;
    eventAvailable: boolean;
    reason: "NO_EVENT" | "WAIT_OPENING" | "SELECT_EVENT" | "OPEN";
    eventId: number | null;
    eventTitle: string;
    eventStartsAt: string | null;
    eventEndsAt: string | null;
    schedulesOpenAt: string | null;
    reservationsOpenAt: string | null;
  };
  config: {
    nome_modulo: string;
    cor_destaque: string;
    responsavelUsuarioId: number | null;
    instrucoes: string;
    responsavel: { id: number; nome: string; email: string } | null;
    atualizado_por_nome: string | null;
    atualizado_em: string;
  };
  stats: { total: number; ocupadas: number; livres: number; especiais: number; reservadas?: number; indisponiveis?: number };
  vagas: Space[];
  setores?: { id: number; nome: string; cor: string; ordem: number }[];
  movimentacoes: Movement[];
  ocorrencias: Occurrence[];
  availableUsers: AvailableUser[];
  ministryMembers: MinistryMember[];
  operator: {
    shiftStats?: { entradas: number; saidas: number; ocorrencias: number } | null;
    id: number;
    nome: string;
    email: string;
    cpfFinal?: string | null;
    papel: string;
    origemAcesso: "ESCALA_ATIVA" | "PERFIL_GESTOR" | "MEMBRO";
    escala: {
      escala_id: number;
      titulo: string;
      inicia_em: string;
      termina_em: string;
      funcao: string;
    } | null;
  };
  permissions: string[];
};

export type ParkingSector = {
  id: string;
  name: string;
  color: string;
  order: number;
  spaces: Space[];
};
