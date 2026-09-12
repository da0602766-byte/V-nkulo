// O que sobrou do sistema de permissão de comunidade única, anterior à reforma
// multi-tenant. O módulo Cultos era o último consumidor dele e foi removido em
// 12/09/2026 por decisão do proprietário; com ele saíram o catálogo de
// permissões legado, `permissionList`, `hasPermission`, `ensureAppUser` e
// `requireApiPermission`, que não tinham mais nenhum chamador.
//
// O tipo abaixo permanece porque descreve a linha de `usuarios` que o sistema
// ATUAL carrega: `local-auth.ts` o preenche e `tenant.ts` o consome. A
// autorização de hoje é a do tenant (`requireTenantPermission`), validada no
// servidor e isolada por comunidade — nada aqui participa dela.
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
  tem_senha?: number;
  redefinicao_pendente?: number;
  titulo_eclesiastico?: string;
  ativo: number;
  criado_em?: string;
  novo_cadastro?: number;
  system_owner?: boolean;
};
