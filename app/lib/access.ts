import { getSessionUser } from "./local-auth";
import { getMaintenanceState } from "./display-control";
import { PILOT_CONFIG } from "./pilot-config";

export const PERMISSION_CATALOG = [
  { key: "VISAO_GERAL_VER", label: "Visualizar a Visão Geral e indicadores" },
  { key: "VISITANTES_VER", label: "Visualizar visitantes" },
  { key: "VISITANTES_CRIAR", label: "Cadastrar visitantes" },
  { key: "VISITANTES_EDITAR", label: "Editar visitantes" },
  { key: "VISITANTES_EXCLUIR", label: "Inativar visitantes" },
  { key: "ACOMPANHAMENTOS_CRIAR", label: "Registrar acompanhamentos" },
  { key: "RELATORIOS_VER", label: "Visualizar relatórios" },
  { key: "CELULAS_VER", label: "Visualizar células" },
  { key: "CELULAS_GERENCIAR", label: "Criar e editar células" },
  { key: "USUARIOS_GERENCIAR", label: "Gerenciar usuários e permissões" },
  { key: "LOUVOR_VER", label: "Louvor: visualizar escalas, músicas e links" },
  { key: "LOUVOR_GERENCIAR", label: "Louvor: criar, editar e excluir escalas" },
  { key: "DIACONIA_VER", label: "Visualizar controle de diaconia" },
  {
    key: "DIACONIA_GERENCIAR",
    label: "Diaconia: gerenciar equipes, cores e escalas",
  },
  {
    key: "DIACONIA_CHECKLIST_GERENCIAR",
    label: "Diaconia: preencher checklist de cumprimento",
  },
  {
    key: "DIACONIA_RANKING_VER",
    label: "Diaconia: visualizar ranking publicado",
  },
  {
    key: "DIACONIA_RANKING_PUBLICAR",
    label: "Diaconia: publicar ou ocultar ranking",
  },
  { key: "TEENS_VER", label: "Teens: visualizar menores de 17 anos" },
  {
    key: "TEENS_GERENCIAR",
    label: "Teens: registrar e editar acompanhamentos",
  },
  { key: "AVISOS_PUBLICAR", label: "Publicar notícias e avisos" },
  {
    key: "MODULOS_PERSONALIZADOS_VER",
    label: "Visualizar módulos personalizados",
  },
  { key: "MODULOS_GERENCIAR", label: "Criar abas e campos personalizados" },
  {
    key: "SISTEMA_PERSONALIZAR",
    label: "Personalizar abas e cores do sistema",
  },
  { key: "CULTOS_VER", label: "Cultos: visualizar rotinas e indicadores" },
  {
    key: "CULTOS_REGISTRAR",
    label: "Cultos: preencher os registros das rotinas atribuídas",
  },
  {
    key: "CULTOS_GERENCIAR",
    label: "Cultos: criar rotinas, escolher responsáveis e editar registros",
  },
] as const;

export const ALL_PERMISSIONS = PERMISSION_CATALOG.map((item) => item.key);

export type AppUser = {
  id: number;
  nome: string;
  email: string;
  perfil: string;
  permissoes: string;
  foto_perfil?: string | null;
  telefone?: string | null;
  data_nascimento?: string | null;
  endereco?: string | null;
  celula?: string | null;
  ministerio?: string | null;
  observacoes?: string | null;
  nome_pais?: string | null;
  diaconia_equipe_id?: number | null;
  diaconia_equipe_nome?: string | null;
  tema_preferido?: string | null;
  culto_registrador?: number;
  tem_senha?: number;
  redefinicao_pendente?: number;
  titulo_eclesiastico?: string;
  ativo: number;
  criado_em?: string;
  novo_cadastro?: number;
  system_owner?: boolean;
};

export function permissionList(user: AppUser): string[] {
  return user.permissoes
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

const TITLE_LEVELS: Record<string, number> = {
  MEMBRO: 0,
  ASPIRANTE: 1,
  DIACONO: 2,
  PRESBITERO: 3,
  PASTOR: 4,
  BISPO: 5,
};

function normalizeTitle(title?: string | null) {
  return (title || "MEMBRO")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
}

export function titleRank(title?: string | null): number {
  return TITLE_LEVELS[normalizeTitle(title)] ?? 0;
}

export function isLeadership(
  user: Pick<AppUser, "perfil" | "titulo_eclesiastico">,
) {
  return (
    user.perfil === "ADMIN" ||
    titleRank(user.titulo_eclesiastico) >= TITLE_LEVELS.PRESBITERO
  );
}

export function automaticPermissionsForUser(user: AppUser): string[] {
  const automatic = new Set<string>();
  const rank = titleRank(user.titulo_eclesiastico);
  const hierarchyConfigured = permissionList(user).includes("HIERARQUIA_CONFIGURADA");

  if (!hierarchyConfigured && rank >= TITLE_LEVELS.ASPIRANTE) {
    automatic.add("LOUVOR_VER");
    automatic.add("CELULAS_VER");
    automatic.add("DIACONIA_VER");
  }

  if (user.diaconia_equipe_id) automatic.add("DIACONIA_VER");

  if (!hierarchyConfigured && rank >= TITLE_LEVELS.PRESBITERO) {
    [
      "VISITANTES_VER",
      "VISITANTES_CRIAR",
      "VISITANTES_EDITAR",
      "ACOMPANHAMENTOS_CRIAR",
      "CELULAS_VER",
      "CELULAS_GERENCIAR",
      "DIACONIA_VER",
      "DIACONIA_GERENCIAR",
      "DIACONIA_CHECKLIST_GERENCIAR",
      "TEENS_VER",
      "CULTOS_VER",
      "CULTOS_REGISTRAR",
      "CULTOS_GERENCIAR",
    ].forEach((permission) => automatic.add(permission));
  }

  if (user.culto_registrador) {
    automatic.add("CULTOS_VER");
    automatic.add("CULTOS_REGISTRAR");
  }

  return [...automatic];
}

export function hasPermission(user: AppUser, permission: string): boolean {
  const permissions = [
    ...permissionList(user),
    ...automaticPermissionsForUser(user),
  ];
  const impliedBy: Record<string, string[]> = {
    LOUVOR_VER: ["LOUVOR_GERENCIAR"],
    DIACONIA_VER: [
      "DIACONIA_GERENCIAR",
      "DIACONIA_CHECKLIST_GERENCIAR",
      "DIACONIA_RANKING_VER",
      "DIACONIA_RANKING_PUBLICAR",
    ],
    DIACONIA_RANKING_VER: ["DIACONIA_RANKING_PUBLICAR"],
    TEENS_VER: ["TEENS_GERENCIAR"],
    MODULOS_PERSONALIZADOS_VER: ["MODULOS_GERENCIAR"],
    CELULAS_VER: ["CELULAS_GERENCIAR"],
    CULTOS_VER: ["CULTOS_REGISTRAR", "CULTOS_GERENCIAR"],
    CULTOS_REGISTRAR: ["CULTOS_GERENCIAR"],
  };
  return (
    user.perfil === "ADMIN" ||
    permissions.includes(permission) ||
    (impliedBy[permission] ?? []).some((item) => permissions.includes(item))
  );
}

export async function ensureAppUser(): Promise<AppUser | null> {
  return getSessionUser();
}

export async function requireApiPermission(permission?: string) {
  const user = await ensureAppUser();
  if (!user)
    return {
      error: Response.json(
        { error: "Faça login para continuar." },
        { status: 401 },
      ),
    };
  if (!user.ativo)
    return {
      error: Response.json({ error: "Usuário inativo." }, { status: 403 }),
    };
  if (!PILOT_CONFIG.legacyModulesEnabled) {
    return {
      error: Response.json(
        {
          error:
            "Este módulo operacional permanece suspenso na V4.5 Piloto até concluir a migração multi-comunidade.",
          pilot: true,
        },
        { status: 423 },
      ),
    };
  }
  if (user.perfil !== "ADMIN") {
    const maintenance = await getMaintenanceState();
    if (maintenance.ativa) {
      return {
        error: Response.json(
          {
            error: maintenance.mensagem,
            manutencao: true,
          },
          { status: 503 },
        ),
      };
    }
  }
  if (permission && !hasPermission(user, permission)) {
    return {
      error: Response.json(
        { error: "Você não possui permissão para esta ação." },
        { status: 403 },
      ),
    };
  }
  return { user };
}
