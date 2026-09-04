import { sql } from "drizzle-orm";
import {
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const usuarios = sqliteTable("usuarios", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  nome: text("nome").notNull(),
  email: text("email").notNull().unique(),
  perfil: text("perfil").notNull().default("ACOMPANHANTE"),
  permissoes: text("permissoes").notNull().default(""),
  fotoPerfil: text("foto_perfil"),
  telefone: text("telefone"),
  cadastroDados: text("cadastro_dados").notNull().default("{}"),
  dataNascimento: text("data_nascimento"),
  endereco: text("endereco"),
  celula: text("celula"),
  ministerio: text("ministerio"),
  observacoes: text("observacoes"),
  nomePais: text("nome_pais"),
  diaconiaEquipeId: integer("diaconia_equipe_id"),
  temaPreferido: text("tema_preferido").notNull().default("CLARO"),
  senhaHash: text("senha_hash"),
  senhaSalt: text("senha_salt"),
  tentativasLogin: integer("tentativas_login").notNull().default(0),
  bloqueadoAte: text("bloqueado_ate"),
  tituloEclesiastico: text("titulo_eclesiastico").notNull().default("MEMBRO"),
  ativo: integer("ativo", { mode: "boolean" }).notNull().default(true),
  criadoEm: text("criado_em")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  atualizadoEm: text("atualizado_em")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export const sessoes = sqliteTable("sessoes", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  usuarioId: integer("usuario_id")
    .notNull()
    .references(() => usuarios.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull().unique(),
  expiraEm: text("expira_em").notNull(),
  criadoEm: text("criado_em")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export const redefinicoesSenha = sqliteTable("redefinicoes_senha", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  usuarioId: integer("usuario_id")
    .notNull()
    .references(() => usuarios.id, { onDelete: "cascade" }),
  solicitadoEm: text("solicitado_em")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  tokenHash: text("token_hash"),
  expiraEm: text("expira_em"),
  usado: integer("usado", { mode: "boolean" }).notNull().default(false),
});

export const comunidades = sqliteTable("comunidades", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  nome: text("nome").notNull(),
  slug: text("slug").notNull().unique(),
  proprietarioUsuarioId: integer("proprietario_usuario_id").references(
    () => usuarios.id,
    { onDelete: "set null" },
  ),
  descricaoPublica: text("descricao_publica").notNull().default(""),
  cidadePublica: text("cidade_publica").notNull().default(""),
  status: text("status").notNull().default("ATIVA"),
  ambienteDemo: integer("ambiente_demo", { mode: "boolean" })
    .notNull()
    .default(true),
  feedPublicoHabilitado: integer("feed_publico_habilitado", {
    mode: "boolean",
  })
    .notNull()
    .default(true),
  seloPastoralStatus: text("selo_pastoral_status")
    .notNull()
    .default("APROVADO"),
  pastorResponsavelUsuarioId: integer("pastor_responsavel_usuario_id").references(
    () => usuarios.id,
    { onDelete: "set null" },
  ),
  seloPastoralPor: integer("selo_pastoral_por").references(() => usuarios.id, {
    onDelete: "set null",
  }),
  seloPastoralEm: text("selo_pastoral_em"),
  fichaCriacao: text("ficha_criacao").notNull().default("{}"),
  criadoEm: text("criado_em")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export const celulas = sqliteTable(
  "celulas",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    comunidadeId: integer("comunidade_id").notNull(),
    nome: text("nome").notNull(),
    responsavel: text("responsavel").notNull(),
    membros: text("membros").notNull().default("[]"),
    observacoes: text("observacoes"),
    diasReuniao: text("dias_reuniao").notNull().default("[]"),
    enderecoPublico: text("endereco_publico").notNull().default(""),
    descricaoPublica: text("descricao_publica").notNull().default(""),
    liderUsuarioId: integer("lider_usuario_id").references(() => usuarios.id, {
      onDelete: "set null",
    }),
    viceLiderUsuarioId: integer("vice_lider_usuario_id").references(
      () => usuarios.id,
      { onDelete: "set null" },
    ),
    ultimoRelatorioEm: text("ultimo_relatorio_em"),
    arquivadaEm: text("arquivada_em"),
    ativo: integer("ativo", { mode: "boolean" }).notNull().default(true),
    escopoConfirmado: integer("escopo_confirmado", { mode: "boolean" })
      .notNull()
      .default(true),
    criadoPor: text("criado_por").notNull(),
    criadoEm: text("criado_em")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    atualizadoEm: text("atualizado_em")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("celulas_comunidade_nome_unique").on(
      table.comunidadeId,
      table.nome,
    ),
    index("celulas_comunidade_ativo_idx").on(
      table.comunidadeId,
      table.ativo,
      table.escopoConfirmado,
      table.nome,
    ),
  ],
);

export const configuracoes = sqliteTable("configuracoes", {
  chave: text("chave").primaryKey(),
  valor: text("valor").notNull(),
  atualizadoPor: text("atualizado_por").notNull(),
  atualizadoEm: text("atualizado_em")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export const visitanteCategorias = sqliteTable(
  "visitante_categorias",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    comunidadeId: integer("comunidade_id")
      .notNull()
      .references(() => comunidades.id, { onDelete: "cascade" }),
    nome: text("nome").notNull(),
    descricao: text("descricao").notNull().default(""),
    icone: text("icone").notNull().default("◎"),
    cor: text("cor").notNull().default("#7357e8"),
    ordem: integer("ordem").notNull().default(0),
    idadeMinima: integer("idade_minima"),
    idadeMaxima: integer("idade_maxima"),
    migracaoAutomatica: integer("migracao_automatica", { mode: "boolean" })
      .notNull()
      .default(false),
    exibirDashboard: integer("exibir_dashboard", { mode: "boolean" })
      .notNull()
      .default(true),
    responsavelUsuarioId: integer("responsavel_usuario_id").references(
      () => usuarios.id,
      { onDelete: "set null" },
    ),
    ministerioId: integer("ministerio_id"),
    ativa: integer("ativa", { mode: "boolean" }).notNull().default(true),
    criadoPor: integer("criado_por").references(() => usuarios.id, {
      onDelete: "set null",
    }),
    criadoEm: text("criado_em").notNull().default(sql`CURRENT_TIMESTAMP`),
    atualizadoEm: text("atualizado_em").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("visitante_categorias_comunidade_nome_unique").on(
      table.comunidadeId,
      table.nome,
    ),
    index("visitante_categorias_comunidade_ordem_idx").on(
      table.comunidadeId,
      table.ativa,
      table.ordem,
    ),
    index("visitante_categorias_comunidade_ministerio_idx").on(
      table.comunidadeId,
      table.ministerioId,
      table.ativa,
    ),
  ],
);

export const visitantes = sqliteTable(
  "visitantes",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    comunidadeId: integer("comunidade_id").notNull(),
    nomeCompleto: text("nome_completo").notNull(),
    dataNascimento: text("data_nascimento"),
    telefone: text("telefone"),
    email: text("email"),
    batizado: text("batizado").notNull().default("NAO_INFORMADO"),
    status: text("status").notNull().default("NOVO"),
    endereco: text("endereco"),
    acompanhante: text("acompanhante"),
    parente: text("parente"),
    celula: text("celula"),
    celulaId: integer("celula_id").references(() => celulas.id, {
      onDelete: "set null",
    }),
    categoriaId: integer("categoria_id").references(
      () => visitanteCategorias.id,
      { onDelete: "set null" },
    ),
    encontroComDeus: integer("encontro_com_deus", { mode: "boolean" })
      .notNull()
      .default(false),
    cursoMembros: integer("curso_membros", { mode: "boolean" })
      .notNull()
      .default(false),
    ministerio: text("ministerio"),
    dataEntrada: text("data_entrada").notNull(),
    observacoes: text("observacoes"),
    criadoPor: text("criado_por").notNull(),
    ativo: integer("ativo", { mode: "boolean" }).notNull().default(true),
    escopoConfirmado: integer("escopo_confirmado", { mode: "boolean" })
      .notNull()
      .default(true),
    criadoEm: text("criado_em")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    atualizadoEm: text("atualizado_em")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("visitantes_comunidade_ativo_idx").on(
      table.comunidadeId,
      table.ativo,
      table.escopoConfirmado,
      table.id,
    ),
    index("visitantes_comunidade_status_idx").on(
      table.comunidadeId,
      table.status,
    ),
    index("visitantes_comunidade_nascimento_idx").on(
      table.comunidadeId,
      table.ativo,
      table.dataNascimento,
    ),
  ],
);

export const celulaAgenda = sqliteTable(
  "celula_agenda",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    comunidadeId: integer("comunidade_id").notNull(),
    celulaId: integer("celula_id")
      .notNull()
      .references(() => celulas.id, { onDelete: "cascade" }),
    titulo: text("titulo").notNull(),
    iniciaEm: text("inicia_em").notNull(),
    terminaEm: text("termina_em").notNull(),
    lembrete: text("lembrete").notNull().default(""),
    visibilidade: text("visibilidade").notNull().default("PUBLICO"),
    criadoPorUsuarioId: integer("criado_por_usuario_id").references(
      () => usuarios.id,
      { onDelete: "set null" },
    ),
    criadoEm: text("criado_em").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("celula_agenda_comunidade_celula_inicio_idx").on(
      table.comunidadeId,
      table.celulaId,
      table.iniciaEm,
    ),
  ],
);

export const celulaRelatorios = sqliteTable(
  "celula_relatorios",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    comunidadeId: integer("comunidade_id").notNull(),
    celulaId: integer("celula_id")
      .notNull()
      .references(() => celulas.id, { onDelete: "cascade" }),
    dataReuniao: text("data_reuniao").notNull(),
    aconteceu: integer("aconteceu", { mode: "boolean" }).notNull().default(true),
    presentes: integer("presentes").notNull().default(0),
    visitantes: integer("visitantes").notNull().default(0),
    observacoes: text("observacoes").notNull().default(""),
    enviadoPorUsuarioId: integer("enviado_por_usuario_id").references(
      () => usuarios.id,
      { onDelete: "set null" },
    ),
    criadoEm: text("criado_em").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("celula_relatorios_celula_data_unique").on(
      table.celulaId,
      table.dataReuniao,
    ),
    index("celula_relatorios_comunidade_data_idx").on(
      table.comunidadeId,
      table.dataReuniao,
    ),
  ],
);

export const celulaSolicitacoes = sqliteTable(
  "celula_solicitacoes",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    comunidadeId: integer("comunidade_id").notNull(),
    celulaId: integer("celula_id")
      .notNull()
      .references(() => celulas.id, { onDelete: "cascade" }),
    usuarioId: integer("usuario_id").references(() => usuarios.id, {
      onDelete: "set null",
    }),
    nome: text("nome").notNull(),
    contato: text("contato").notNull().default(""),
    mensagem: text("mensagem").notNull().default(""),
    status: text("status").notNull().default("PENDENTE"),
    criadoEm: text("criado_em").notNull().default(sql`CURRENT_TIMESTAMP`),
    atualizadoEm: text("atualizado_em").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("celula_solicitacoes_comunidade_celula_status_idx").on(
      table.comunidadeId,
      table.celulaId,
      table.status,
    ),
  ],
);

export const acompanhamentos = sqliteTable(
  "acompanhamentos",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    comunidadeId: integer("comunidade_id").notNull(),
    visitanteId: integer("visitante_id")
      .notNull()
      .references(() => visitantes.id, { onDelete: "cascade" }),
    responsavelEmail: text("responsavel_email").notNull(),
    tipo: text("tipo").notNull(),
    resultado: text("resultado").notNull(),
    descricao: text("descricao"),
    proximoContato: text("proximo_contato"),
    escopoConfirmado: integer("escopo_confirmado", { mode: "boolean" })
      .notNull()
      .default(true),
    criadoEm: text("criado_em")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("acompanhamentos_comunidade_visitante_idx").on(
      table.comunidadeId,
      table.visitanteId,
      table.id,
    ),
  ],
);

export const louvorEscalas = sqliteTable("louvor_escalas", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  titulo: text("titulo").notNull(),
  dataCulto: text("data_culto").notNull(),
  horario: text("horario"),
  local: text("local"),
  observacoes: text("observacoes"),
  musicas: text("musicas").notNull().default("[]"),
  integrantes: text("integrantes").notNull().default("[]"),
  links: text("links").notNull().default("[]"),
  criadoPor: text("criado_por").notNull(),
  criadoEm: text("criado_em")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export const diaconiaEquipes = sqliteTable("diaconia_equipes", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  nome: text("nome").notNull().unique(),
  cor: text("cor").notNull().default("#17877f"),
  responsavel: text("responsavel").notNull(),
  integrantes: text("integrantes").notNull().default("[]"),
  ativo: integer("ativo", { mode: "boolean" }).notNull().default(true),
  criadoPor: text("criado_por").notNull(),
  criadoEm: text("criado_em")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  atualizadoEm: text("atualizado_em")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export const diaconias = sqliteTable("diaconias", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  titulo: text("titulo").notNull(),
  dataServico: text("data_servico").notNull(),
  responsavel: text("responsavel").notNull(),
  integrantes: text("integrantes").notNull().default("[]"),
  tarefas: text("tarefas").notNull().default("[]"),
  equipeId: integer("equipe_id").references(() => diaconiaEquipes.id, {
    onDelete: "set null",
  }),
  checklist: text("checklist").notNull().default("[]"),
  cumprida: integer("cumprida", { mode: "boolean" }).notNull().default(false),
  observacoes: text("observacoes"),
  status: text("status").notNull().default("PLANEJADA"),
  criadoPor: text("criado_por").notNull(),
  criadoEm: text("criado_em")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export const cultoRotinas = sqliteTable("culto_rotinas", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  titulo: text("titulo").notNull(),
  dataCulto: text("data_culto").notNull(),
  horario: text("horario"),
  equipeId: integer("equipe_id").references(() => diaconiaEquipes.id, {
    onDelete: "set null",
  }),
  registradorUsuarioId: integer("registrador_usuario_id").references(
    () => usuarios.id,
    { onDelete: "set null" },
  ),
  camposExtras: text("campos_extras").notNull().default("[]"),
  observacoes: text("observacoes"),
  status: text("status").notNull().default("ABERTA"),
  criadoPor: text("criado_por").notNull(),
  criadoEm: text("criado_em")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  atualizadoEm: text("atualizado_em")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export const cultoLancamentos = sqliteTable("culto_lancamentos", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  rotinaId: integer("rotina_id")
    .notNull()
    .references(() => cultoRotinas.id, { onDelete: "cascade" }),
  registradoPorUsuarioId: integer("registrado_por_usuario_id").references(
    () => usuarios.id,
    { onDelete: "set null" },
  ),
  registradoPorNome: text("registrado_por_nome").notNull(),
  pessoasCulto: integer("pessoas_culto").notNull().default(0),
  visitantes: integer("visitantes").notNull().default(0),
  cestasBasicas: integer("cestas_basicas").notNull().default(0),
  visitasDia: integer("visitas_dia").notNull().default(0),
  visitasLares: integer("visitas_lares").notNull().default(0),
  teens: integer("teens").notNull().default(0),
  adultos: integer("adultos").notNull().default(0),
  jovens: integer("jovens").notNull().default(0),
  kids: integer("kids").notNull().default(0),
  bebes: integer("bebes").notNull().default(0),
  extras: text("extras").notNull().default("{}"),
  observacoes: text("observacoes"),
  criadoEm: text("criado_em")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  atualizadoEm: text("atualizado_em")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export const avisos = sqliteTable(
  "avisos",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    titulo: text("titulo").notNull(),
    resumo: text("resumo").notNull(),
    conteudo: text("conteudo"),
    imagem: text("imagem"),
    tipo: text("tipo").notNull().default("AVISO"),
    prioridade: text("prioridade").notNull().default("NORMAL"),
    publicado: integer("publicado", { mode: "boolean" })
      .notNull()
      .default(true),
    publicadoPor: text("publicado_por").notNull(),
    publicadoEm: text("publicado_em")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    aniversarioUsuarioId: integer("aniversario_usuario_id").references(
      () => usuarios.id,
      { onDelete: "set null" },
    ),
    aniversarioAno: integer("aniversario_ano"),
  },
  (table) => [
    uniqueIndex("avisos_aniversario_usuario_ano_unique").on(
      table.aniversarioUsuarioId,
      table.aniversarioAno,
    ),
  ],
);

export const avisoReacoes = sqliteTable(
  "aviso_reacoes",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    avisoId: integer("aviso_id")
      .notNull()
      .references(() => avisos.id, { onDelete: "cascade" }),
    usuarioId: integer("usuario_id")
      .notNull()
      .references(() => usuarios.id, { onDelete: "cascade" }),
    emoji: text("emoji").notNull(),
    criadoEm: text("criado_em")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("aviso_reacoes_aviso_usuario_emoji_unique").on(
      table.avisoId,
      table.usuarioId,
      table.emoji,
    ),
  ],
);

export const avisoComentarios = sqliteTable("aviso_comentarios", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  avisoId: integer("aviso_id")
    .notNull()
    .references(() => avisos.id, { onDelete: "cascade" }),
  usuarioId: integer("usuario_id")
    .notNull()
    .references(() => usuarios.id, { onDelete: "cascade" }),
  texto: text("texto").notNull(),
  criadoEm: text("criado_em")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export const teensAcompanhamentos = sqliteTable("teens_acompanhamentos", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  usuarioId: integer("usuario_id")
    .notNull()
    .references(() => usuarios.id, { onDelete: "cascade" }),
  responsavelEmail: text("responsavel_email").notNull(),
  resultado: text("resultado").notNull(),
  descricao: text("descricao"),
  proximoContato: text("proximo_contato"),
  criadoEm: text("criado_em")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export const blocosTexto = sqliteTable("blocos_texto", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  area: text("area").notNull(),
  posicao: text("posicao").notNull().default("TOPO"),
  titulo: text("titulo"),
  conteudo: text("conteudo").notNull(),
  cor: text("cor").notNull().default("#eef7f6"),
  ordem: integer("ordem").notNull().default(0),
  ativo: integer("ativo", { mode: "boolean" }).notNull().default(true),
  criadoPor: text("criado_por").notNull(),
  criadoEm: text("criado_em")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  atualizadoEm: text("atualizado_em")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export const ministerioModulos = sqliteTable("ministerio_modulos", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  nome: text("nome").notNull(),
  slug: text("slug").notNull().unique(),
  descricao: text("descricao"),
  icone: text("icone").notNull().default("◇"),
  permissao: text("permissao").notNull().default("MODULOS_PERSONALIZADOS_VER"),
  campos: text("campos").notNull().default("[]"),
  conteudo: text("conteudo").notNull().default("[]"),
  cor: text("cor").notNull().default("#17877f"),
  ativo: integer("ativo", { mode: "boolean" }).notNull().default(true),
  ordem: integer("ordem").notNull().default(0),
  criadoPor: text("criado_por").notNull(),
  criadoEm: text("criado_em")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export const notificacoesSistema = sqliteTable("notificacoes_sistema", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  tipo: text("tipo").notNull().default("INFO"),
  titulo: text("titulo").notNull(),
  mensagem: text("mensagem").notNull(),
  area: text("area").notNull().default("MENU"),
  entidadeId: integer("entidade_id"),
  usuarioId: integer("usuario_id").references(() => usuarios.id, {
    onDelete: "cascade",
  }),
  comunidadeId: integer("comunidade_id").references(() => comunidades.id, {
    onDelete: "cascade",
  }),
  remetenteUsuarioId: integer("remetente_usuario_id").references(
    () => usuarios.id,
    { onDelete: "set null" },
  ),
  destinoRota: text("destino_rota").notNull().default(""),
  hierarquia: text("hierarquia").notNull().default(""),
  ministerio: text("ministerio").notNull().default(""),
  criadoPor: text("criado_por").notNull(),
  criadoEm: text("criado_em")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export const conversasPrivadas = sqliteTable(
  "conversas_privadas",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    comunidadeId: integer("comunidade_id")
      .notNull()
      .references(() => comunidades.id, { onDelete: "cascade" }),
    usuarioMenorId: integer("usuario_menor_id")
      .notNull()
      .references(() => usuarios.id, { onDelete: "cascade" }),
    usuarioMaiorId: integer("usuario_maior_id")
      .notNull()
      .references(() => usuarios.id, { onDelete: "cascade" }),
    cicloMes: text("ciclo_mes").notNull(),
    driveFileId: text("drive_file_id"),
    storageProvider: text("storage_provider").notNull().default("PLATFORM_LEGACY"),
    atualizadoEm: text("atualizado_em").notNull().default(sql`CURRENT_TIMESTAMP`),
    criadoEm: text("criado_em").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("conversas_privadas_par_ciclo_unique").on(
      table.comunidadeId,
      table.usuarioMenorId,
      table.usuarioMaiorId,
      table.cicloMes,
    ),
    index("conversas_privadas_usuario_menor_idx").on(
      table.comunidadeId,
      table.usuarioMenorId,
      table.atualizadoEm,
    ),
    index("conversas_privadas_usuario_maior_idx").on(
      table.comunidadeId,
      table.usuarioMaiorId,
      table.atualizadoEm,
    ),
  ],
);

export const googleConnections = sqliteTable(
  "google_connections",
  {
    userId: integer("usuario_id")
      .primaryKey()
      .references(() => usuarios.id, { onDelete: "cascade" }),
    googleSub: text("google_sub").notNull().unique(),
    googleEmail: text("google_email").notNull(),
    refreshTokenCiphertext: text("refresh_token_ciphertext"),
    refreshTokenIv: text("refresh_token_iv"),
    scopes: text("scopes").notNull().default("openid email profile"),
    driveEnabled: integer("drive_enabled", { mode: "boolean" }).notNull().default(false),
    connectedAt: text("connected_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    revokedAt: text("revoked_at"),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("google_connections_email_idx").on(table.googleEmail)],
);

export const storagePreferences = sqliteTable("storage_preferences", {
  userId: integer("usuario_id")
    .primaryKey()
    .references(() => usuarios.id, { onDelete: "cascade" }),
  provider: text("provider").notNull().default("LOCAL"),
  autoLoadRecent: integer("auto_load_recent", { mode: "boolean" }).notNull().default(true),
  autoDownloadFiles: integer("auto_download_files", { mode: "boolean" }).notNull().default(false),
  consentedAt: text("consented_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const userDriveStorage = sqliteTable("user_drive_storage", {
  userId: integer("usuario_id")
    .primaryKey()
    .references(() => usuarios.id, { onDelete: "cascade" }),
  rootFolderId: text("pasta_raiz_id").notNull(),
  privateMediaFolderId: text("pasta_midias_privadas_id").notNull(),
  createdAt: text("criado_em").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("atualizado_em").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const communityDriveStorage = sqliteTable(
  "community_drive_storage",
  {
    communityId: integer("comunidade_id")
      .primaryKey()
      .references(() => comunidades.id, { onDelete: "cascade" }),
    ownerUserId: integer("proprietario_usuario_id")
      .notNull()
      .references(() => usuarios.id, { onDelete: "restrict" }),
    rootFolderId: text("pasta_raiz_id").notNull(),
    mediaFolderId: text("pasta_midias_id").notNull(),
    chatFolderId: text("pasta_conversas_id").notNull(),
    migrationStatus: text("status_migracao").notNull().default("PENDING"),
    migratedAt: text("migrado_em"),
    createdAt: text("criado_em").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("atualizado_em").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("community_drive_owner_idx").on(table.ownerUserId)],
);

export const mensagensPrivadas = sqliteTable(
  "mensagens_privadas",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    conversaId: integer("conversa_id")
      .notNull()
      .references(() => conversasPrivadas.id, { onDelete: "cascade" }),
    remetenteId: integer("remetente_id")
      .notNull()
      .references(() => usuarios.id, { onDelete: "cascade" }),
    mensagem: text("mensagem").notNull(),
    lidaEm: text("lida_em"),
    criadoEm: text("criado_em").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("mensagens_privadas_conversa_idx").on(
      table.conversaId,
      table.criadoEm,
      table.id,
    ),
    index("mensagens_privadas_remetente_lida_idx").on(
      table.remetenteId,
      table.lidaEm,
    ),
  ],
);

export const notificacoesLidas = sqliteTable(
  "notificacoes_lidas",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    notificacaoId: integer("notificacao_id")
      .notNull()
      .references(() => notificacoesSistema.id, { onDelete: "cascade" }),
    usuarioId: integer("usuario_id")
      .notNull()
      .references(() => usuarios.id, { onDelete: "cascade" }),
    lidaEm: text("lida_em").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("notificacoes_lidas_usuario_notificacao_unique").on(
      table.usuarioId,
      table.notificacaoId,
    ),
  ],
);

export const mensagensExibicao = sqliteTable("mensagens_exibicao", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  titulo: text("titulo").notNull(),
  mensagem: text("mensagem").notNull(),
  tipo: text("tipo").notNull().default("INFO"),
  areas: text("areas").notNull().default("[]"),
  animacao: text("animacao").notNull().default("SUAVE"),
  intervaloSegundos: integer("intervalo_segundos").notNull().default(7),
  iniciaEm: text("inicia_em"),
  terminaEm: text("termina_em"),
  ativo: integer("ativo", { mode: "boolean" }).notNull().default(true),
  criadoPor: text("criado_por").notNull(),
  criadoEm: text("criado_em")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  atualizadoEm: text("atualizado_em")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export const ministerioRegistros = sqliteTable("ministerio_registros", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  moduloId: integer("modulo_id")
    .notNull()
    .references(() => ministerioModulos.id, { onDelete: "cascade" }),
  dados: text("dados").notNull().default("{}"),
  criadoPor: text("criado_por").notNull(),
  criadoEm: text("criado_em")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export const usuarioComunidades = sqliteTable(
  "usuario_comunidades",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    usuarioId: integer("usuario_id")
      .notNull()
      .references(() => usuarios.id, { onDelete: "cascade" }),
    comunidadeId: integer("comunidade_id")
      .notNull()
      .references(() => comunidades.id, { onDelete: "cascade" }),
    papel: text("papel").notNull().default("MEMBRO"),
    status: text("status").notNull().default("ATIVO"),
    criadoEm: text("criado_em")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("usuario_comunidades_usuario_comunidade_unique").on(
      table.usuarioId,
      table.comunidadeId,
    ),
  ],
);

export const acessosPainelPastoral = sqliteTable(
  "acessos_painel_pastoral",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    comunidadeId: integer("comunidade_id")
      .notNull()
      .references(() => comunidades.id, { onDelete: "cascade" }),
    usuarioId: integer("usuario_id")
      .notNull()
      .references(() => usuarios.id, { onDelete: "cascade" }),
    concedidoPor: integer("concedido_por")
      .notNull()
      .references(() => usuarios.id, { onDelete: "cascade" }),
    ativo: integer("ativo", { mode: "boolean" }).notNull().default(true),
    criadoEm: text("criado_em").notNull().default(sql`CURRENT_TIMESTAMP`),
    atualizadoEm: text("atualizado_em").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("acessos_painel_pastoral_comunidade_usuario_unique").on(
      table.comunidadeId,
      table.usuarioId,
    ),
    index("acessos_painel_pastoral_usuario_idx").on(
      table.usuarioId,
      table.ativo,
    ),
  ],
);

export const presencasComunidade = sqliteTable(
  "presencas_comunidade",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    usuarioId: integer("usuario_id")
      .notNull()
      .references(() => usuarios.id, { onDelete: "cascade" }),
    comunidadeId: integer("comunidade_id")
      .notNull()
      .references(() => comunidades.id, { onDelete: "cascade" }),
    ultimaAtividade: text("ultima_atividade")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    exibirUltimaAtividade: integer("exibir_ultima_atividade", {
      mode: "boolean",
    })
      .notNull()
      .default(true),
  },
  (table) => [
    uniqueIndex("presencas_comunidade_usuario_comunidade_unique").on(
      table.usuarioId,
      table.comunidadeId,
    ),
    index("presencas_comunidade_comunidade_atividade_idx").on(
      table.comunidadeId,
      table.ultimaAtividade,
    ),
  ],
);

export const oficiaisComunidade = sqliteTable(
  "oficiais_comunidade",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    usuarioComunidadeId: integer("usuario_comunidade_id")
      .notNull()
      .references(() => usuarioComunidades.id, { onDelete: "cascade" }),
    titulo: text("titulo").notNull(),
    permissoes: text("permissoes").notNull().default(""),
    atualizadoPor: integer("atualizado_por").references(() => usuarios.id, {
      onDelete: "set null",
    }),
    criadoEm: text("criado_em")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    atualizadoEm: text("atualizado_em")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("oficiais_comunidade_vinculo_unique").on(
      table.usuarioComunidadeId,
    ),
  ],
);

export const solicitacoesEntradaComunidade = sqliteTable(
  "solicitacoes_entrada_comunidade",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    comunidadeId: integer("comunidade_id")
      .notNull()
      .references(() => comunidades.id, { onDelete: "cascade" }),
    usuarioId: integer("usuario_id")
      .notNull()
      .references(() => usuarios.id, { onDelete: "cascade" }),
    mensagem: text("mensagem").notNull().default(""),
    status: text("status").notNull().default("PENDENTE"),
    analisadoPor: integer("analisado_por").references(() => usuarios.id, {
      onDelete: "set null",
    }),
    solicitadoEm: text("solicitado_em")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    analisadoEm: text("analisado_em"),
    atualizadoEm: text("atualizado_em")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("solicitacoes_entrada_usuario_comunidade_unique").on(
      table.usuarioId,
      table.comunidadeId,
    ),
    index("solicitacoes_entrada_comunidade_status_idx").on(
      table.comunidadeId,
      table.status,
      table.solicitadoEm,
    ),
  ],
);

export const convitesComunidade = sqliteTable("convites_comunidade", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  comunidadeId: integer("comunidade_id")
    .notNull()
    .references(() => comunidades.id, { onDelete: "cascade" }),
  email: text("email").notNull(),
  papel: text("papel").notNull().default("MEMBRO"),
  tokenHash: text("token_hash").notNull().unique(),
  status: text("status").notNull().default("PENDENTE"),
  expiraEm: text("expira_em").notNull(),
  criadoPor: integer("criado_por")
    .notNull()
    .references(() => usuarios.id, { onDelete: "restrict" }),
  usadoPor: integer("usado_por").references(() => usuarios.id, {
    onDelete: "set null",
  }),
  criadoEm: text("criado_em")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  usadoEm: text("usado_em"),
});

export const featureFlags = sqliteTable(
  "feature_flags",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    flagKey: text("flag_key").notNull(),
    scopeType: text("scope_type").notNull().default("GLOBAL"),
    scopeId: integer("scope_id").notNull().default(0),
    enabled: integer("enabled", { mode: "boolean" })
      .notNull()
      .default(false),
    iniciaEm: text("inicia_em"),
    terminaEm: text("termina_em"),
    configJson: text("config_json").notNull().default("{}"),
    alteradoPor: integer("alterado_por").references(() => usuarios.id, {
      onDelete: "set null",
    }),
    alteradoEm: text("alterado_em")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("feature_flags_chave_escopo_unique").on(
      table.flagKey,
      table.scopeType,
      table.scopeId,
    ),
  ],
);

export const planosRede = sqliteTable("planos_rede", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  nome: text("nome").notNull(),
  slug: text("slug").notNull().unique(),
  limiteAfiliadas: integer("limite_afiliadas").notNull().default(0),
  valorFuturoCentavos: integer("valor_futuro_centavos")
    .notNull()
    .default(0),
  ativo: integer("ativo", { mode: "boolean" }).notNull().default(true),
  criadoEm: text("criado_em")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export const redesIgrejas = sqliteTable(
  "redes_igrejas",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    nome: text("nome").notNull(),
    slug: text("slug").notNull().unique(),
    comunidadeMaeId: integer("comunidade_mae_id")
      .notNull()
      .references(() => comunidades.id, { onDelete: "restrict" }),
    planoId: integer("plano_id").references(() => planosRede.id, {
      onDelete: "set null",
    }),
    status: text("status").notNull().default("ATIVA"),
    limiteAfiliadas: integer("limite_afiliadas").notNull().default(0),
    valorFuturoCentavos: integer("valor_futuro_centavos")
      .notNull()
      .default(0),
    isenta: integer("isenta", { mode: "boolean" }).notNull().default(false),
    testeInicio: text("teste_inicio"),
    testeFim: text("teste_fim"),
    statusComercial: text("status_comercial")
      .notNull()
      .default("SEM_COBRANCA"),
    criadoPor: integer("criado_por").references(() => usuarios.id, {
      onDelete: "set null",
    }),
    atualizadoPor: integer("atualizado_por").references(() => usuarios.id, {
      onDelete: "set null",
    }),
    criadoEm: text("criado_em")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    atualizadoEm: text("atualizado_em")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("redes_igrejas_comunidade_mae_unique").on(
      table.comunidadeMaeId,
    ),
  ],
);

export const redeUnidades = sqliteTable(
  "rede_unidades",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    redeId: integer("rede_id")
      .notNull()
      .references(() => redesIgrejas.id, { onDelete: "cascade" }),
    comunidadeId: integer("comunidade_id")
      .notNull()
      .references(() => comunidades.id, { onDelete: "restrict" }),
    tipo: text("tipo").notNull().default("AFILIADA"),
    regiao: text("regiao").notNull().default(""),
    status: text("status").notNull().default("ATIVA"),
    responsavelUsuarioId: integer("responsavel_usuario_id").references(
      () => usuarios.id,
      { onDelete: "set null" },
    ),
    pastorInterinoUsuarioId: integer("pastor_interino_usuario_id").references(
      () => usuarios.id,
      { onDelete: "set null" },
    ),
    restricaoNivel: integer("restricao_nivel").notNull().default(0),
    prazoResponsavel: text("prazo_responsavel"),
    criadoPor: integer("criado_por").references(() => usuarios.id, {
      onDelete: "set null",
    }),
    criadoEm: text("criado_em")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    atualizadoEm: text("atualizado_em")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("rede_unidades_comunidade_unique").on(table.comunidadeId),
    index("rede_unidades_rede_tipo_idx").on(
      table.redeId,
      table.tipo,
      table.status,
    ),
  ],
);

export const redeAdministradores = sqliteTable(
  "rede_administradores",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    redeId: integer("rede_id")
      .notNull()
      .references(() => redesIgrejas.id, { onDelete: "cascade" }),
    usuarioId: integer("usuario_id")
      .notNull()
      .references(() => usuarios.id, { onDelete: "cascade" }),
    papel: text("papel").notNull().default("NETWORK_ADMIN"),
    regiao: text("regiao").notNull().default(""),
    ativo: integer("ativo", { mode: "boolean" }).notNull().default(true),
    iniciaEm: text("inicia_em"),
    terminaEm: text("termina_em"),
    criadoPor: integer("criado_por").references(() => usuarios.id, {
      onDelete: "set null",
    }),
    criadoEm: text("criado_em")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("rede_administradores_usuario_unique").on(
      table.redeId,
      table.usuarioId,
    ),
    index("rede_administradores_acesso_idx").on(
      table.usuarioId,
      table.ativo,
      table.redeId,
    ),
  ],
);

export const politicasEditoriaisIa = sqliteTable(
  "politicas_editoriais_ia",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    scopeType: text("scope_type").notNull().default("GLOBAL"),
    scopeId: integer("scope_id").notNull().default(0),
    modo: text("modo").notNull().default("COM_REVISAO"),
    status: text("status").notNull().default("ATIVA"),
    publicacaoAutomatica: integer("publicacao_automatica", { mode: "boolean" })
      .notNull()
      .default(false),
    categoriasPermitidas: text("categorias_permitidas")
      .notNull()
      .default("[]"),
    temasProibidos: text("temas_proibidos").notNull().default("[]"),
    frequencia: text("frequencia").notNull().default("SEMANAL"),
    horarios: text("horarios").notNull().default('["09:00"]'),
    comunidadesDestino: text("comunidades_destino").notNull().default("[]"),
    quantidadeDiaria: integer("quantidade_diaria").notNull().default(1),
    tamanhoMaximo: integer("tamanho_maximo").notNull().default(1200),
    usarImagens: integer("usar_imagens", { mode: "boolean" })
      .notNull()
      .default(false),
    fontesPermitidas: text("fontes_permitidas").notNull().default("[]"),
    criadoPor: integer("criado_por").references(() => usuarios.id, {
      onDelete: "set null",
    }),
    atualizadoPor: integer("atualizado_por").references(() => usuarios.id, {
      onDelete: "set null",
    }),
    criadoEm: text("criado_em")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    atualizadoEm: text("atualizado_em")
      .notNull()
      .default("1970-01-01T00:00:00.000Z"),
  },
  (table) => [
    uniqueIndex("politicas_editoriais_ia_escopo_unique").on(
      table.scopeType,
      table.scopeId,
    ),
  ],
);

export const rascunhosEditoriaisIa = sqliteTable(
  "rascunhos_editoriais_ia",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    comunidadeId: integer("comunidade_id")
      .notNull()
      .references(() => comunidades.id, { onDelete: "cascade" }),
    titulo: text("titulo").notNull(),
    conteudo: text("conteudo").notNull(),
    categoria: text("categoria").notNull(),
    referencia: text("referencia").notNull().default(""),
    origem: text("origem").notNull().default("IA"),
    status: text("status").notNull().default("AGUARDANDO_REVISAO"),
    politicaAplicada: text("politica_aplicada").notNull(),
    versao: integer("versao").notNull().default(1),
    motivoBloqueio: text("motivo_bloqueio").notNull().default(""),
    hashSemantico: text("hash_semantico").notNull(),
    conteudoSemelhanteId: integer("conteudo_semelhante_id"),
    revisadoPor: integer("revisado_por").references(() => usuarios.id, {
      onDelete: "set null",
    }),
    revisadoEm: text("revisado_em"),
    criadoEm: text("criado_em")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    atualizadoEm: text("atualizado_em")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("rascunhos_editoriais_status_idx").on(
      table.status,
      table.criadoEm,
      table.id,
    ),
    index("rascunhos_editoriais_comunidade_idx").on(
      table.comunidadeId,
      table.criadoEm,
      table.id,
    ),
  ],
);

export const publicacoesPiloto = sqliteTable("publicacoes_piloto", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  comunidadeId: integer("comunidade_id")
    .references(() => comunidades.id, { onDelete: "cascade" }),
  titulo: text("titulo").notNull(),
  resumo: text("resumo").notNull(),
  conteudo: text("conteudo").notNull().default(""),
  categoria: text("categoria").notNull().default("COMUNIDADE"),
  visibilidade: text("visibilidade").notNull().default("COMUNIDADE"),
  status: text("status").notNull().default("PUBLICADA"),
  origem: text("origem").notNull().default("DEMO"),
  comentariosHabilitados: integer("comentarios_habilitados", {
    mode: "boolean",
  })
    .notNull()
    .default(true),
  imagemUrl: text("imagem_url").notNull().default(""),
  imagemThumbnailUrl: text("imagem_thumbnail_url").notNull().default(""),
  imagemAlt: text("imagem_alt").notNull().default(""),
  imagemWidth: integer("imagem_width").notNull().default(0),
  imagemHeight: integer("imagem_height").notNull().default(0),
  linksJson: text("links_json").notNull().default("[]"),
  audienciaTipo: text("audiencia_tipo").notNull().default("PUBLICO"),
  ministeriosJson: text("ministerios_json").notNull().default("[]"),
  canalFeed: integer("canal_feed", { mode: "boolean" }).notNull().default(true),
  canalLateral: integer("canal_lateral", { mode: "boolean" }).notNull().default(false),
  aprovacaoStatus: text("aprovacao_status").notNull().default("APROVADA"),
  aprovadoPor: integer("aprovado_por").references(() => usuarios.id, { onDelete: "set null" }),
  aprovadoEm: text("aprovado_em"),
  criadoPor: integer("criado_por").references(() => usuarios.id, {
    onDelete: "set null",
  }),
  criadoEm: text("criado_em")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  atualizadoEm: text("atualizado_em")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export const programacoesEditoriais = sqliteTable(
  "programacoes_editoriais",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    comunidadeId: integer("comunidade_id")
      .notNull()
      .references(() => comunidades.id, { onDelete: "cascade" }),
    titulo: text("titulo").notNull(),
    mensagem: text("mensagem").notNull(),
    categoria: text("categoria").notNull(),
    referencia: text("referencia").notNull().default(""),
    imagemUrl: text("imagem_url").notNull().default(""),
    imagemAlt: text("imagem_alt").notNull().default(""),
    visibilidade: text("visibilidade").notNull().default("PLATAFORMA"),
    comentariosHabilitados: integer("comentarios_habilitados", {
      mode: "boolean",
    })
      .notNull()
      .default(true),
    status: text("status").notNull().default("RASCUNHO"),
    publicarEm: text("publicar_em").notNull(),
    autorizadoPor: integer("autorizado_por").references(() => usuarios.id, {
      onDelete: "set null",
    }),
    autorizadoEm: text("autorizado_em"),
    canceladoPor: integer("cancelado_por").references(() => usuarios.id, {
      onDelete: "set null",
    }),
    canceladoEm: text("cancelado_em"),
    publicacaoId: integer("publicacao_id").references(
      () => publicacoesPiloto.id,
      { onDelete: "set null" },
    ),
    criadoPor: integer("criado_por").references(() => usuarios.id, {
      onDelete: "set null",
    }),
    criadoEm: text("criado_em")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    atualizadoEm: text("atualizado_em")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("programacoes_editoriais_status_data_idx").on(
      table.status,
      table.publicarEm,
      table.id,
    ),
    index("programacoes_editoriais_comunidade_idx").on(
      table.comunidadeId,
      table.status,
      table.publicarEm,
    ),
  ],
);

export const comentariosPublicacao = sqliteTable(
  "comentarios_publicacao",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    publicacaoId: integer("publicacao_id")
      .notNull()
      .references(() => publicacoesPiloto.id, { onDelete: "cascade" }),
    usuarioId: integer("usuario_id").references(() => usuarios.id, {
      onDelete: "set null",
    }),
    autorNomeSnapshot: text("autor_nome_snapshot").notNull(),
    texto: text("texto").notNull(),
    perfilVisivel: integer("perfil_visivel", { mode: "boolean" })
      .notNull()
      .default(false),
    status: text("status").notNull().default("PUBLICADO"),
    criadoEm: text("criado_em")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    atualizadoEm: text("atualizado_em")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("comentarios_publicacao_post_status_idx").on(
      table.publicacaoId,
      table.status,
      table.criadoEm,
    ),
    index("comentarios_publicacao_usuario_idx").on(
      table.usuarioId,
      table.criadoEm,
    ),
  ],
);

export const eventosComunidade = sqliteTable(
  "eventos_comunidade",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    comunidadeId: integer("comunidade_id")
      .notNull()
      .references(() => comunidades.id, { onDelete: "cascade" }),
    titulo: text("titulo").notNull(),
    descricao: text("descricao").notNull().default(""),
    categoria: text("categoria").notNull().default("OUTRO"),
    iniciaEm: text("inicia_em").notNull(),
    terminaEm: text("termina_em"),
    local: text("local").notNull().default(""),
    publico: integer("publico", { mode: "boolean" }).notNull().default(false),
    status: text("status").notNull().default("RASCUNHO"),
    capacidade: integer("capacidade"),
    escalasAbremEm: text("escalas_abrem_em"),
    reservasAbremEm: text("reservas_abrem_em"),
    criadoPor: integer("criado_por").references(() => usuarios.id, {
      onDelete: "set null",
    }),
    atualizadoPor: integer("atualizado_por").references(() => usuarios.id, {
      onDelete: "set null",
    }),
    criadoEm: text("criado_em")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    atualizadoEm: text("atualizado_em")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("eventos_comunidade_status_data_idx").on(
      table.comunidadeId,
      table.status,
      table.iniciaEm,
      table.id,
    ),
    index("eventos_publicos_data_idx").on(
      table.publico,
      table.status,
      table.iniciaEm,
    ),
  ],
);

export const confirmacoesEvento = sqliteTable(
  "confirmacoes_evento",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    eventoId: integer("evento_id")
      .notNull()
      .references(() => eventosComunidade.id, { onDelete: "cascade" }),
    comunidadeId: integer("comunidade_id")
      .notNull()
      .references(() => comunidades.id, { onDelete: "cascade" }),
    usuarioId: integer("usuario_id")
      .notNull()
      .references(() => usuarios.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("CONFIRMADO"),
    criadoEm: text("criado_em")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    atualizadoEm: text("atualizado_em")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("confirmacoes_evento_usuario_unique").on(
      table.eventoId,
      table.usuarioId,
    ),
    index("confirmacoes_evento_comunidade_status_idx").on(
      table.comunidadeId,
      table.status,
      table.eventoId,
    ),
  ],
);

export const ministeriosComunidade = sqliteTable(
  "ministerios_comunidade",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    comunidadeId: integer("comunidade_id")
      .notNull()
      .references(() => comunidades.id, { onDelete: "cascade" }),
    nome: text("nome").notNull(),
    descricao: text("descricao").notNull().default(""),
    categoria: text("categoria").notNull().default("OUTRO"),
    status: text("status").notNull().default("ATIVO"),
    youtubeUrl: text("youtube_url").notNull().default(""),
    spotifyUrl: text("spotify_url").notNull().default(""),
    bannerUrl: text("banner_url").notNull().default(""),
    responsavelUsuarioId: integer("responsavel_usuario_id").references(
      () => usuarios.id,
      { onDelete: "set null" },
    ),
    criadoPor: integer("criado_por").references(() => usuarios.id, {
      onDelete: "set null",
    }),
    atualizadoPor: integer("atualizado_por").references(() => usuarios.id, {
      onDelete: "set null",
    }),
    criadoEm: text("criado_em")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    atualizadoEm: text("atualizado_em")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("ministerios_comunidade_nome_unique").on(
      table.comunidadeId,
      table.nome,
    ),
    index("ministerios_comunidade_status_idx").on(
      table.comunidadeId,
      table.status,
      table.nome,
    ),
  ],
);

export const ministerioVoluntarios = sqliteTable(
  "ministerio_voluntarios",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    comunidadeId: integer("comunidade_id")
      .notNull()
      .references(() => comunidades.id, { onDelete: "cascade" }),
    ministerioId: integer("ministerio_id")
      .notNull()
      .references(() => ministeriosComunidade.id, { onDelete: "cascade" }),
    usuarioId: integer("usuario_id")
      .notNull()
      .references(() => usuarios.id, { onDelete: "cascade" }),
    funcao: text("funcao").notNull(),
    papel: text("papel").notNull().default("VOLUNTARIO"),
    diasDisponiveis: text("dias_disponiveis").notNull().default("[]"),
    periodoPreferido: text("periodo_preferido")
      .notNull()
      .default("FLEXIVEL"),
    limiteEscalas: integer("limite_escalas").notNull().default(4),
    ativo: integer("ativo", { mode: "boolean" }).notNull().default(true),
    criadoEm: text("criado_em")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    atualizadoEm: text("atualizado_em")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("ministerio_voluntarios_usuario_unique").on(
      table.ministerioId,
      table.usuarioId,
    ),
    index("ministerio_voluntarios_comunidade_usuario_idx").on(
      table.comunidadeId,
      table.usuarioId,
      table.ativo,
    ),
  ],
);

export const ministerioEquipes = sqliteTable(
  "ministerio_equipes",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    comunidadeId: integer("comunidade_id")
      .notNull()
      .references(() => comunidades.id, { onDelete: "cascade" }),
    ministerioId: integer("ministerio_id")
      .notNull()
      .references(() => ministeriosComunidade.id, { onDelete: "cascade" }),
    nome: text("nome").notNull(),
    descricao: text("descricao").notNull().default(""),
    cor: text("cor").notNull().default("#7357e8"),
    ordem: integer("ordem").notNull().default(0),
    ativa: integer("ativa", { mode: "boolean" }).notNull().default(true),
    criadoPor: integer("criado_por").references(() => usuarios.id, {
      onDelete: "set null",
    }),
    criadoEm: text("criado_em").notNull().default(sql`CURRENT_TIMESTAMP`),
    atualizadoEm: text("atualizado_em").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("ministerio_equipes_nome_unique").on(
      table.ministerioId,
      table.nome,
    ),
    index("ministerio_equipes_comunidade_idx").on(
      table.comunidadeId,
      table.ministerioId,
      table.ativa,
      table.ordem,
    ),
  ],
);

export const ministerioEquipeMembros = sqliteTable(
  "ministerio_equipe_membros",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    comunidadeId: integer("comunidade_id")
      .notNull()
      .references(() => comunidades.id, { onDelete: "cascade" }),
    ministerioId: integer("ministerio_id")
      .notNull()
      .references(() => ministeriosComunidade.id, { onDelete: "cascade" }),
    equipeId: integer("equipe_id")
      .notNull()
      .references(() => ministerioEquipes.id, { onDelete: "cascade" }),
    voluntarioId: integer("voluntario_id")
      .notNull()
      .references(() => ministerioVoluntarios.id, { onDelete: "cascade" }),
    criadoEm: text("criado_em").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("ministerio_equipe_membros_unique").on(
      table.equipeId,
      table.voluntarioId,
    ),
    index("ministerio_equipe_membros_voluntario_idx").on(
      table.comunidadeId,
      table.ministerioId,
      table.voluntarioId,
    ),
  ],
);

export const ministerioFuncoes = sqliteTable(
  "ministerio_funcoes",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    comunidadeId: integer("comunidade_id")
      .notNull()
      .references(() => comunidades.id, { onDelete: "cascade" }),
    ministerioId: integer("ministerio_id")
      .notNull()
      .references(() => ministeriosComunidade.id, { onDelete: "cascade" }),
    nome: text("nome").notNull(),
    descricao: text("descricao").notNull().default(""),
    ativa: integer("ativa", { mode: "boolean" }).notNull().default(true),
    criadoPor: integer("criado_por").references(() => usuarios.id, {
      onDelete: "set null",
    }),
    criadoEm: text("criado_em")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    atualizadoEm: text("atualizado_em")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("ministerio_funcoes_nome_unique").on(
      table.ministerioId,
      table.nome,
    ),
    index("ministerio_funcoes_comunidade_idx").on(
      table.comunidadeId,
      table.ministerioId,
      table.ativa,
    ),
  ],
);

export const ministerioModelosEscala = sqliteTable(
  "ministerio_modelos_escala",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    comunidadeId: integer("comunidade_id")
      .notNull()
      .references(() => comunidades.id, { onDelete: "cascade" }),
    ministerioId: integer("ministerio_id")
      .notNull()
      .references(() => ministeriosComunidade.id, { onDelete: "cascade" }),
    nome: text("nome").notNull(),
    titulo: text("titulo").notNull(),
    duracaoMinutos: integer("duracao_minutos").notNull().default(120),
    local: text("local").notNull().default(""),
    observacoes: text("observacoes").notNull().default(""),
    checklistModelo: text("checklist_modelo").notNull().default("[]"),
    camposPersonalizados: text("campos_personalizados")
      .notNull()
      .default("[]"),
    versao: integer("versao").notNull().default(1),
    ativo: integer("ativo", { mode: "boolean" }).notNull().default(true),
    criadoPor: integer("criado_por").references(() => usuarios.id, {
      onDelete: "set null",
    }),
    criadoEm: text("criado_em")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    atualizadoEm: text("atualizado_em")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("ministerio_modelos_escala_nome_unique").on(
      table.ministerioId,
      table.nome,
    ),
    index("ministerio_modelos_escala_comunidade_idx").on(
      table.comunidadeId,
      table.ministerioId,
      table.ativo,
    ),
  ],
);

export const ministerioLinksReutilizaveis = sqliteTable(
  "ministerio_links_reutilizaveis",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    comunidadeId: integer("comunidade_id")
      .notNull()
      .references(() => comunidades.id, { onDelete: "cascade" }),
    ministerioId: integer("ministerio_id")
      .notNull()
      .references(() => ministeriosComunidade.id, { onDelete: "cascade" }),
    tipo: text("tipo").notNull(),
    titulo: text("titulo").notNull(),
    url: text("url").notNull(),
    ativo: integer("ativo", { mode: "boolean" }).notNull().default(true),
    criadoPor: integer("criado_por").references(() => usuarios.id, {
      onDelete: "set null",
    }),
    criadoEm: text("criado_em").notNull().default(sql`CURRENT_TIMESTAMP`),
    atualizadoEm: text("atualizado_em").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("ministerio_links_reutilizaveis_url_unique").on(
      table.ministerioId,
      table.url,
    ),
    index("ministerio_links_reutilizaveis_comunidade_idx").on(
      table.comunidadeId,
      table.ministerioId,
      table.ativo,
    ),
  ],
);

export const linksCadastroMembros = sqliteTable(
  "links_cadastro_membros",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    comunidadeOrigemId: integer("comunidade_origem_id")
      .notNull()
      .references(() => comunidades.id, { onDelete: "cascade" }),
    criadoPor: integer("criado_por")
      .notNull()
      .references(() => usuarios.id, { onDelete: "cascade" }),
    token: text("token").notNull().unique(),
    titulo: text("titulo").notNull().default("Cadastro de membros"),
    abreEm: text("abre_em").notNull(),
    fechaEm: text("fecha_em").notNull(),
    status: text("status").notNull().default("ATIVO"),
    autoExcluir: integer("auto_excluir", { mode: "boolean" })
      .notNull()
      .default(false),
    criadoEm: text("criado_em").notNull().default(sql`CURRENT_TIMESTAMP`),
    atualizadoEm: text("atualizado_em")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("links_cadastro_membros_criador_idx").on(
      table.criadoPor,
      table.status,
      table.fechaEm,
    ),
    index("links_cadastro_membros_comunidade_idx").on(
      table.comunidadeOrigemId,
      table.status,
      table.id,
    ),
  ],
);

export const cadastrosMembrosTemporarios = sqliteTable(
  "cadastros_membros_temporarios",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    linkId: integer("link_id")
      .notNull()
      .references(() => linksCadastroMembros.id, { onDelete: "cascade" }),
    comunidadeId: integer("comunidade_id")
      .notNull()
      .references(() => comunidades.id, { onDelete: "cascade" }),
    ministerioId: integer("ministerio_id")
      .notNull()
      .references(() => ministeriosComunidade.id, { onDelete: "restrict" }),
    nomeCompleto: text("nome_completo").notNull(),
    email: text("email").notNull(),
    cpf: text("cpf").notNull().default(""),
    cep: text("cep").notNull(),
    dataNascimento: text("data_nascimento").notNull(),
    uncao: text("uncao").notNull(),
    fotoUrl: text("foto_url").notNull().default(""),
    ministerioDados: text("ministerio_dados").notNull().default("{}"),
    status: text("status").notNull().default("PENDENTE"),
    enviadoEm: text("enviado_em").notNull().default(sql`CURRENT_TIMESTAMP`),
    atualizadoEm: text("atualizado_em")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("cadastros_membros_link_email_unique").on(
      table.linkId,
      table.email,
    ),
    index("cadastros_membros_comunidade_status_idx").on(
      table.comunidadeId,
      table.status,
      table.enviadoEm,
    ),
    index("cadastros_membros_ministerio_idx").on(
      table.comunidadeId,
      table.ministerioId,
      table.enviadoEm,
    ),
  ],
);

export const escalasMinisterio = sqliteTable(
  "escalas_ministerio",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    comunidadeId: integer("comunidade_id")
      .notNull()
      .references(() => comunidades.id, { onDelete: "cascade" }),
    ministerioId: integer("ministerio_id")
      .notNull()
      .references(() => ministeriosComunidade.id, { onDelete: "cascade" }),
    equipeId: integer("equipe_id").references(() => ministerioEquipes.id, {
      onDelete: "set null",
    }),
    titulo: text("titulo").notNull(),
    iniciaEm: text("inicia_em").notNull(),
    terminaEm: text("termina_em").notNull(),
    local: text("local").notNull().default(""),
    status: text("status").notNull().default("RASCUNHO"),
    observacoes: text("observacoes").notNull().default(""),
    repertorio: text("repertorio").notNull().default("[]"),
    linksRecursos: text("links_recursos").notNull().default("[]"),
    responsavelUsuarioId: integer("responsavel_usuario_id").references(
      () => usuarios.id,
      { onDelete: "set null" },
    ),
    shareToken: text("share_token"),
    compartilhadoEm: text("compartilhado_em"),
    publicarEm: text("publicar_em"),
    modeloSnapshot: text("modelo_snapshot").notNull().default("{}"),
    camposRespostas: text("campos_respostas").notNull().default("{}"),
    criadoPor: integer("criado_por").references(() => usuarios.id, {
      onDelete: "set null",
    }),
    atualizadoPor: integer("atualizado_por").references(() => usuarios.id, {
      onDelete: "set null",
    }),
    criadoEm: text("criado_em")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    atualizadoEm: text("atualizado_em")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("escalas_ministerio_status_data_idx").on(
      table.comunidadeId,
      table.status,
      table.iniciaEm,
      table.id,
    ),
    index("escalas_ministerio_ministerio_data_idx").on(
      table.comunidadeId,
      table.ministerioId,
      table.iniciaEm,
    ),
    index("escalas_ministerio_publicacao_idx").on(
      table.comunidadeId,
      table.status,
      table.publicarEm,
    ),
    uniqueIndex("escalas_ministerio_share_token_unique").on(table.shareToken),
  ],
);

export const escalaDesignacoes = sqliteTable(
  "escala_designacoes",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    comunidadeId: integer("comunidade_id")
      .notNull()
      .references(() => comunidades.id, { onDelete: "cascade" }),
    escalaId: integer("escala_id")
      .notNull()
      .references(() => escalasMinisterio.id, { onDelete: "cascade" }),
    voluntarioId: integer("voluntario_id")
      .notNull()
      .references(() => ministerioVoluntarios.id, { onDelete: "cascade" }),
    usuarioId: integer("usuario_id")
      .notNull()
      .references(() => usuarios.id, { onDelete: "cascade" }),
    funcao: text("funcao").notNull(),
    status: text("status").notNull().default("PENDENTE"),
    ativo: integer("ativo", { mode: "boolean" }).notNull().default(true),
    respostaEm: text("resposta_em"),
    criadoEm: text("criado_em")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    atualizadoEm: text("atualizado_em")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("escala_designacoes_voluntario_unique").on(
      table.escalaId,
      table.voluntarioId,
    ),
    index("escala_designacoes_comunidade_usuario_idx").on(
      table.comunidadeId,
      table.usuarioId,
      table.ativo,
      table.status,
    ),
  ],
);

export const acessosTemporarios = sqliteTable(
  "acessos_temporarios",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    comunidadeId: integer("comunidade_id")
      .notNull()
      .references(() => comunidades.id, { onDelete: "cascade" }),
    escalaId: integer("escala_id")
      .notNull()
      .references(() => escalasMinisterio.id, { onDelete: "cascade" }),
    designacaoId: integer("designacao_id")
      .notNull()
      .references(() => escalaDesignacoes.id, { onDelete: "cascade" }),
    beneficiarioUsuarioId: integer("beneficiario_usuario_id")
      .notNull()
      .references(() => usuarios.id, { onDelete: "restrict" }),
    recurso: text("recurso").notNull(),
    tokenHash: text("token_hash").notNull(),
    tokenHint: text("token_hint").notNull().default(""),
    iniciaEm: text("inicia_em").notNull(),
    terminaEm: text("termina_em").notNull(),
    status: text("status").notNull().default("PENDENTE"),
    autorizadoPor: integer("autorizado_por").references(() => usuarios.id, {
      onDelete: "set null",
    }),
    criadoPor: integer("criado_por").references(() => usuarios.id, {
      onDelete: "set null",
    }),
    ativadoEm: text("ativado_em"),
    canceladoPor: integer("cancelado_por").references(() => usuarios.id, {
      onDelete: "set null",
    }),
    canceladoEm: text("cancelado_em"),
    negadoPor: integer("negado_por").references(() => usuarios.id, {
      onDelete: "set null",
    }),
    negadoEm: text("negado_em"),
    motivoNegacao: text("motivo_negacao").notNull().default(""),
    expiradoEm: text("expirado_em"),
    criadoEm: text("criado_em").notNull().default(sql`CURRENT_TIMESTAMP`),
    atualizadoEm: text("atualizado_em").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("acessos_temporarios_token_hash_unique").on(table.tokenHash),
    index("acessos_temporarios_escala_status_idx").on(
      table.comunidadeId,
      table.escalaId,
      table.status,
    ),
    index("acessos_temporarios_usuario_status_idx").on(
      table.beneficiarioUsuarioId,
      table.comunidadeId,
      table.status,
      table.terminaEm,
    ),
  ],
);

export const ministerioChecklistItens = sqliteTable(
  "ministerio_checklist_itens",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    comunidadeId: integer("comunidade_id")
      .notNull()
      .references(() => comunidades.id, { onDelete: "cascade" }),
    escalaId: integer("escala_id")
      .notNull()
      .references(() => escalasMinisterio.id, { onDelete: "cascade" }),
    designacaoId: integer("designacao_id").references(
      () => escalaDesignacoes.id,
      { onDelete: "set null" },
    ),
    tarefa: text("tarefa").notNull(),
    status: text("status").notNull().default("PENDENTE"),
    substitutoUsuarioId: integer("substituto_usuario_id").references(
      () => usuarios.id,
      { onDelete: "set null" },
    ),
    substitutoExternoNome: text("substituto_externo_nome")
      .notNull()
      .default(""),
    observacao: text("observacao").notNull().default(""),
    atualizadoPor: integer("atualizado_por").references(() => usuarios.id, {
      onDelete: "set null",
    }),
    criadoEm: text("criado_em")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    atualizadoEm: text("atualizado_em")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("ministerio_checklist_escala_idx").on(
      table.comunidadeId,
      table.escalaId,
      table.status,
      table.id,
    ),
  ],
);

export const diaconiaChecklistItens = sqliteTable(
  "diaconia_checklist_itens",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    comunidadeId: integer("comunidade_id")
      .notNull()
      .references(() => comunidades.id, { onDelete: "cascade" }),
    escalaId: integer("escala_id")
      .notNull()
      .references(() => escalasMinisterio.id, { onDelete: "cascade" }),
    designacaoId: integer("designacao_id").references(
      () => escalaDesignacoes.id,
      { onDelete: "set null" },
    ),
    tarefa: text("tarefa").notNull(),
    status: text("status").notNull().default("PENDENTE"),
    substitutoUsuarioId: integer("substituto_usuario_id").references(
      () => usuarios.id,
      { onDelete: "set null" },
    ),
    substitutoExternoNome: text("substituto_externo_nome")
      .notNull()
      .default(""),
    observacao: text("observacao").notNull().default(""),
    atualizadoPor: integer("atualizado_por").references(() => usuarios.id, {
      onDelete: "set null",
    }),
    criadoEm: text("criado_em")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    atualizadoEm: text("atualizado_em")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("diaconia_checklist_escala_idx").on(
      table.comunidadeId,
      table.escalaId,
      table.status,
      table.id,
    ),
  ],
);

export const diaconiaRelatorios = sqliteTable(
  "diaconia_relatorios",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    comunidadeId: integer("comunidade_id")
      .notNull()
      .references(() => comunidades.id, { onDelete: "cascade" }),
    escalaId: integer("escala_id")
      .notNull()
      .references(() => escalasMinisterio.id, { onDelete: "cascade" }),
    resumo: text("resumo").notNull(),
    status: text("status").notNull().default("FINALIZADO"),
    destinatariosNotificados: integer("destinatarios_notificados")
      .notNull()
      .default(0),
    encerradoPor: integer("encerrado_por").references(() => usuarios.id, {
      onDelete: "set null",
    }),
    encerradoEm: text("encerrado_em")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    atualizadoEm: text("atualizado_em")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("diaconia_relatorios_escala_unique").on(table.escalaId),
    index("diaconia_relatorios_comunidade_idx").on(
      table.comunidadeId,
      table.encerradoEm,
      table.id,
    ),
  ],
);

export const solicitacoesComunidade = sqliteTable(
  "solicitacoes_comunidade",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    comunidadeId: integer("comunidade_id")
      .notNull()
      .references(() => comunidades.id, { onDelete: "cascade" }),
    solicitanteId: integer("solicitante_id")
      .notNull()
      .references(() => usuarios.id, { onDelete: "restrict" }),
    tipo: text("tipo").notNull(),
    titulo: text("titulo").notNull(),
    descricao: text("descricao").notNull(),
    visibilidade: text("visibilidade").notNull().default("GESTORES"),
    status: text("status").notNull().default("ABERTA"),
    criadoEm: text("criado_em")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    atualizadoEm: text("atualizado_em")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("solicitacoes_comunidade_tenant_status_idx").on(
      table.comunidadeId,
      table.status,
      table.id,
    ),
    index("solicitacoes_comunidade_solicitante_idx").on(
      table.comunidadeId,
      table.solicitanteId,
      table.id,
    ),
  ],
);

export const solicitacoesCriacaoComunidade = sqliteTable(
  "solicitacoes_criacao_comunidade",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    solicitanteId: integer("solicitante_id")
      .notNull()
      .references(() => usuarios.id, { onDelete: "restrict" }),
    nome: text("nome").notNull(),
    descricao: text("descricao").notNull(),
    cidade: text("cidade").notNull(),
    emailInstitucional: text("email_institucional").notNull(),
    fichaCriacao: text("ficha_criacao").notNull().default("{}"),
    status: text("status").notNull().default("PENDENTE"),
    observacaoProprietario: text("observacao_proprietario")
      .notNull()
      .default(""),
    analisadoPor: integer("analisado_por").references(() => usuarios.id, {
      onDelete: "set null",
    }),
    analisadoEm: text("analisado_em"),
    comunidadeId: integer("comunidade_id").references(() => comunidades.id, {
      onDelete: "set null",
    }),
    criadoEm: text("criado_em").notNull().default(sql`CURRENT_TIMESTAMP`),
    atualizadoEm: text("atualizado_em")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("solicitacoes_criacao_status_idx").on(
      table.status,
      table.criadoEm,
      table.id,
    ),
    index("solicitacoes_criacao_solicitante_idx").on(
      table.solicitanteId,
      table.status,
      table.id,
    ),
  ],
);

export const solicitacaoPublicos = sqliteTable(
  "solicitacao_publicos",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    solicitacaoId: integer("solicitacao_id")
      .notNull()
      .references(() => solicitacoesComunidade.id, { onDelete: "cascade" }),
    comunidadeId: integer("comunidade_id")
      .notNull()
      .references(() => comunidades.id, { onDelete: "cascade" }),
    tipo: text("tipo").notNull(),
    referenciaId: integer("referencia_id"),
    referenciaTexto: text("referencia_texto").notNull().default(""),
    criadoEm: text("criado_em").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("solicitacao_publicos_alvo_unique").on(
      table.solicitacaoId,
      table.tipo,
      table.referenciaId,
      table.referenciaTexto,
    ),
    index("solicitacao_publicos_comunidade_idx").on(
      table.comunidadeId,
      table.solicitacaoId,
    ),
  ],
);

export const solicitacaoDestinatarios = sqliteTable(
  "solicitacao_destinatarios",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    solicitacaoId: integer("solicitacao_id")
      .notNull()
      .references(() => solicitacoesComunidade.id, { onDelete: "cascade" }),
    comunidadeId: integer("comunidade_id")
      .notNull()
      .references(() => comunidades.id, { onDelete: "cascade" }),
    usuarioId: integer("usuario_id")
      .notNull()
      .references(() => usuarios.id, { onDelete: "cascade" }),
    notificadoEm: text("notificado_em"),
    visualizadoEm: text("visualizado_em"),
    criadoEm: text("criado_em").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("solicitacao_destinatarios_unique").on(
      table.solicitacaoId,
      table.usuarioId,
    ),
    index("solicitacao_destinatarios_usuario_idx").on(
      table.comunidadeId,
      table.usuarioId,
      table.solicitacaoId,
    ),
  ],
);

export const solicitacaoRepositorios = sqliteTable(
  "solicitacao_repositorios",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    comunidadeId: integer("comunidade_id")
      .notNull()
      .references(() => comunidades.id, { onDelete: "cascade" }),
    tipo: text("tipo").notNull(),
    nome: text("nome").notNull(),
    ministerioId: integer("ministerio_id").references(
      () => ministeriosComunidade.id,
      { onDelete: "set null" },
    ),
    status: text("status").notNull().default("SUGERIDO"),
    confirmadoPor: integer("confirmado_por").references(() => usuarios.id, {
      onDelete: "set null",
    }),
    confirmadoEm: text("confirmado_em"),
    criadoEm: text("criado_em").notNull().default(sql`CURRENT_TIMESTAMP`),
    atualizadoEm: text("atualizado_em")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("solicitacao_repositorios_tipo_unique").on(
      table.comunidadeId,
      table.tipo,
    ),
    index("solicitacao_repositorios_status_idx").on(
      table.comunidadeId,
      table.status,
      table.tipo,
    ),
  ],
);

export const solicitacaoRepositorioItens = sqliteTable(
  "solicitacao_repositorio_itens",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    repositorioId: integer("repositorio_id")
      .notNull()
      .references(() => solicitacaoRepositorios.id, { onDelete: "cascade" }),
    comunidadeId: integer("comunidade_id")
      .notNull()
      .references(() => comunidades.id, { onDelete: "cascade" }),
    solicitacaoId: integer("solicitacao_id")
      .notNull()
      .references(() => solicitacoesComunidade.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("ABERTO"),
    encaminhadoPor: integer("encaminhado_por").references(() => usuarios.id, {
      onDelete: "set null",
    }),
    responsavelUsuarioId: integer("responsavel_usuario_id").references(() => usuarios.id, {
      onDelete: "set null",
    }),
    mensagemAtendimento: text("mensagem_atendimento").notNull().default(""),
    testemunho: text("testemunho").notNull().default(""),
    testemunhoCompartilhavel: integer("testemunho_compartilhavel").notNull().default(-1),
    testemunhoPublicadoEm: text("testemunho_publicado_em"),
    finalizadoEm: text("finalizado_em"),
    criadoEm: text("criado_em").notNull().default(sql`CURRENT_TIMESTAMP`),
    atualizadoEm: text("atualizado_em")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("solicitacao_repositorio_itens_unique").on(
      table.repositorioId,
      table.solicitacaoId,
    ),
    index("solicitacao_repositorio_itens_status_idx").on(
      table.comunidadeId,
      table.repositorioId,
      table.status,
    ),
    index("solicitacao_repositorio_itens_finalizado_idx").on(
      table.comunidadeId,
      table.finalizadoEm,
    ),
  ],
);

export const pastorWhatsappPreferencias = sqliteTable(
  "pastor_whatsapp_preferencias",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    comunidadeId: integer("comunidade_id")
      .notNull()
      .references(() => comunidades.id, { onDelete: "cascade" }),
    usuarioId: integer("usuario_id")
      .notNull()
      .references(() => usuarios.id, { onDelete: "cascade" }),
    disponivel: integer("disponivel", { mode: "boolean" })
      .notNull()
      .default(false),
    atualizadoEm: text("atualizado_em")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("pastor_whatsapp_preferencias_unique").on(
      table.comunidadeId,
      table.usuarioId,
    ),
    index("pastor_whatsapp_preferencias_disponivel_idx").on(
      table.comunidadeId,
      table.disponivel,
    ),
  ],
);

export const estacionamentoConfiguracoes = sqliteTable(
  "estacionamento_configuracoes",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    comunidadeId: integer("comunidade_id")
      .notNull()
      .references(() => comunidades.id, { onDelete: "cascade" }),
    ativo: integer("ativo", { mode: "boolean" }).notNull().default(true),
    nomeModulo: text("nome_modulo").notNull().default("Estacionamento"),
    corDestaque: text("cor_destaque").notNull().default("#d99a32"),
    regras: text("regras").notNull().default("{}"),
    camposPersonalizados: text("campos_personalizados").notNull().default("[]"),
    atualizadoPor: integer("atualizado_por").references(() => usuarios.id, {
      onDelete: "set null",
    }),
    criadoEm: text("criado_em")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    atualizadoEm: text("atualizado_em")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("estacionamento_config_comunidade_unique").on(
      table.comunidadeId,
    ),
  ],
);

export const estacionamentoSetores = sqliteTable(
  "estacionamento_setores",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    comunidadeId: integer("comunidade_id")
      .notNull()
      .references(() => comunidades.id, { onDelete: "cascade" }),
    nome: text("nome").notNull(),
    cor: text("cor").notNull().default("#3b82f6"),
    ordem: integer("ordem").notNull().default(0),
    ativo: integer("ativo", { mode: "boolean" }).notNull().default(true),
    criadoEm: text("criado_em")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("estacionamento_setor_nome_unique").on(
      table.comunidadeId,
      table.nome,
    ),
    index("estacionamento_setor_comunidade_idx").on(
      table.comunidadeId,
      table.ativo,
      table.ordem,
    ),
  ],
);

export const estacionamentoVagas = sqliteTable(
  "estacionamento_vagas",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    comunidadeId: integer("comunidade_id")
      .notNull()
      .references(() => comunidades.id, { onDelete: "cascade" }),
    setorId: integer("setor_id")
      .notNull()
      .references(() => estacionamentoSetores.id, { onDelete: "cascade" }),
    codigo: text("codigo").notNull(),
    tipo: text("tipo").notNull().default("COMUM"),
      status: text("status").notNull().default("LIVRE"),
      posicaoX: integer("posicao_x").notNull().default(0),
      posicaoY: integer("posicao_y").notNull().default(0),
      ativo: integer("ativo", { mode: "boolean" }).notNull().default(true),
    criadoEm: text("criado_em")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    atualizadoEm: text("atualizado_em")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("estacionamento_vaga_codigo_unique").on(
      table.comunidadeId,
      table.codigo,
    ),
    index("estacionamento_vaga_comunidade_status_idx").on(
      table.comunidadeId,
      table.status,
      table.tipo,
    ),
  ],
);

export const estacionamentoMovimentacoes = sqliteTable(
  "estacionamento_movimentacoes",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    comunidadeId: integer("comunidade_id")
      .notNull()
      .references(() => comunidades.id, { onDelete: "cascade" }),
    vagaId: integer("vaga_id").references(() => estacionamentoVagas.id, {
      onDelete: "set null",
    }),
    eventoId: integer("evento_id").references(() => eventosComunidade.id, {
      onDelete: "set null",
    }),
    placa: text("placa").notNull(),
    tipoVeiculo: text("tipo_veiculo").notNull().default("CARRO"),
    responsavel: text("responsavel").notNull(),
    vinculo: text("vinculo").notNull().default("VISITANTE"),
    entradaEm: text("entrada_em")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    saidaEm: text("saida_em"),
    status: text("status").notNull().default("NO_LOCAL"),
    observacoes: text("observacoes").notNull().default(""),
    criadoPor: integer("criado_por").references(() => usuarios.id, {
      onDelete: "set null",
    }),
    atualizadoPor: integer("atualizado_por").references(() => usuarios.id, {
      onDelete: "set null",
    }),
    criadoEm: text("criado_em")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    atualizadoEm: text("atualizado_em")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("estacionamento_movimento_comunidade_status_idx").on(
      table.comunidadeId,
      table.status,
      table.entradaEm,
    ),
    index("estacionamento_movimento_comunidade_placa_idx").on(
      table.comunidadeId,
      table.placa,
      table.entradaEm,
    ),
  ],
);

export const estacionamentoOcorrencias = sqliteTable(
  "estacionamento_ocorrencias",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    comunidadeId: integer("comunidade_id")
      .notNull()
      .references(() => comunidades.id, { onDelete: "cascade" }),
    movimentacaoId: integer("movimentacao_id").references(
      () => estacionamentoMovimentacoes.id,
      { onDelete: "set null" },
    ),
    tipo: text("tipo").notNull(),
    descricao: text("descricao").notNull(),
    gravidade: text("gravidade").notNull().default("BAIXA"),
    status: text("status").notNull().default("ABERTA"),
    criadoPor: integer("criado_por").references(() => usuarios.id, {
      onDelete: "set null",
    }),
    criadoEm: text("criado_em")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    atualizadoEm: text("atualizado_em")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("estacionamento_ocorrencia_comunidade_status_idx").on(
      table.comunidadeId,
      table.status,
      table.criadoEm,
    ),
  ],
);

export const estacionamentoReservas = sqliteTable(
  "estacionamento_reservas",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    comunidadeId: integer("comunidade_id").notNull().references(() => comunidades.id, { onDelete: "cascade" }),
    vagaId: integer("vaga_id").notNull().references(() => estacionamentoVagas.id, { onDelete: "restrict" }),
    usuarioId: integer("usuario_id").notNull().references(() => usuarios.id, { onDelete: "cascade" }),
    eventoId: integer("evento_id").references(() => eventosComunidade.id, { onDelete: "set null" }),
    eventoTitulo: text("evento_titulo").notNull().default(""),
    nomeCompleto: text("nome_completo").notNull(),
    email: text("email").notNull(),
    telefone: text("telefone").notNull().default(""),
    placaVeiculo: text("placa_veiculo").notNull().default(""),
    tipoVeiculo: text("tipo_veiculo").notNull().default("CARRO"),
    modeloVeiculo: text("modelo_veiculo").notNull().default(""),
    corVeiculo: text("cor_veiculo").notNull().default(""),
    documentoHash: text("documento_hash").notNull(),
    documentoMascarado: text("documento_mascarado").notNull(),
    inicioEm: text("inicio_em").notNull(),
    fimEm: text("fim_em").notNull(),
    codigo: text("codigo").notNull(),
    status: text("status").notNull().default("PENDENTE"),
    confirmadoPor: integer("confirmado_por").references(() => usuarios.id, { onDelete: "set null" }),
    checkinEm: text("checkin_em"),
    criadoEm: text("criado_em").notNull().default(sql`CURRENT_TIMESTAMP`),
    atualizadoEm: text("atualizado_em").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("estacionamento_reserva_codigo_unique").on(table.codigo),
    index("estacionamento_reserva_comunidade_status_idx").on(table.comunidadeId, table.status, table.inicioEm),
    index("estacionamento_reserva_usuario_idx").on(table.comunidadeId, table.usuarioId, table.inicioEm),
    index("estacionamento_reserva_evento_idx").on(table.comunidadeId, table.eventoId, table.inicioEm),
  ],
);

export const estacionamentoRelatoriosEscala = sqliteTable(
  "estacionamento_relatorios_escala",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    comunidadeId: integer("comunidade_id").notNull().references(() => comunidades.id, { onDelete: "cascade" }),
    escalaId: integer("escala_id").notNull().references(() => escalasMinisterio.id, { onDelete: "cascade" }),
    usuarioId: integer("usuario_id").notNull().references(() => usuarios.id, { onDelete: "cascade" }),
    resumo: text("resumo").notNull().default(""),
    entradas: integer("entradas").notNull().default(0),
    saidas: integer("saidas").notNull().default(0),
    ocorrencias: integer("ocorrencias").notNull().default(0),
    status: text("status").notNull().default("AGUARDANDO_MEMBRO"),
    revisadoPor: integer("revisado_por").references(() => usuarios.id, { onDelete: "set null" }),
    enviadoPastorEm: text("enviado_pastor_em"),
    criadoEm: text("criado_em").notNull().default(sql`CURRENT_TIMESTAMP`),
    atualizadoEm: text("atualizado_em").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("estacionamento_relatorio_escala_usuario_unique").on(table.escalaId, table.usuarioId),
    index("estacionamento_relatorio_comunidade_status_idx").on(table.comunidadeId, table.status, table.atualizadoEm),
  ],
);

export const solicitacoesCicloComunidade = sqliteTable(
  "solicitacoes_ciclo_comunidade",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    comunidadeId: integer("comunidade_id")
      .notNull()
      .references(() => comunidades.id, { onDelete: "restrict" }),
    tipo: text("tipo").notNull(),
    status: text("status").notNull(),
    decisao: text("decisao").notNull().default("PENDENTE"),
    motivo: text("motivo").notNull(),
    categoriaMotivo: text("categoria_motivo").notNull(),
    descricao: text("descricao").notNull(),
    evidencias: text("evidencias").notNull().default("[]"),
    evidenciaObrigatoria: integer("evidencia_obrigatoria", {
      mode: "boolean",
    })
      .notNull()
      .default(false),
    senhaReconfirmada: integer("senha_reconfirmada", { mode: "boolean" })
      .notNull()
      .default(false),
    mfaStatus: text("mfa_status").notNull().default("PENDENTE_EXTERNO"),
    solicitanteId: integer("solicitante_id")
      .notNull()
      .references(() => usuarios.id, { onDelete: "restrict" }),
    analistaId: integer("analista_id").references(() => usuarios.id, {
      onDelete: "set null",
    }),
    justificativaAnalise: text("justificativa_analise"),
    bloqueios: text("bloqueios").notNull().default("[]"),
    snapshotConfiguracao: text("snapshot_configuracao")
      .notNull()
      .default("{}"),
    solicitadoEm: text("solicitado_em")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    analisadoEm: text("analisado_em"),
    atualizadoEm: text("atualizado_em")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("solicitacoes_ciclo_comunidade_status_idx").on(
      table.comunidadeId,
      table.status,
      table.solicitadoEm,
    ),
    index("solicitacoes_ciclo_analise_idx").on(
      table.decisao,
      table.status,
      table.solicitadoEm,
    ),
  ],
);

export const retencoesComunidade = sqliteTable(
  "retencoes_comunidade",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    comunidadeId: integer("comunidade_id")
      .notNull()
      .references(() => comunidades.id, { onDelete: "restrict" }),
    tipo: text("tipo").notNull(),
    motivo: text("motivo").notNull(),
    status: text("status").notNull().default("ATIVA"),
    criadoPor: integer("criado_por").references(() => usuarios.id, {
      onDelete: "set null",
    }),
    iniciaEm: text("inicia_em")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    terminaEm: text("termina_em"),
    criadoEm: text("criado_em")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("retencoes_comunidade_status_idx").on(
      table.comunidadeId,
      table.status,
      table.terminaEm,
    ),
  ],
);

export const auditoriaPiloto = sqliteTable("auditoria_piloto", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  comunidadeId: integer("comunidade_id").references(() => comunidades.id, {
    onDelete: "set null",
  }),
  usuarioId: integer("usuario_id").references(() => usuarios.id, {
    onDelete: "set null",
  }),
  evento: text("evento").notNull(),
  resultado: text("resultado").notNull(),
  metadados: text("metadados").notNull().default("{}"),
  criadoEm: text("criado_em")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export const layoutsInterface = sqliteTable(
  "layouts_interface",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    comunidadeId: integer("comunidade_id")
      .notNull()
      .references(() => comunidades.id, { onDelete: "cascade" }),
    usuarioId: integer("usuario_id").references(() => usuarios.id, {
      onDelete: "cascade",
    }),
    escopo: text("escopo").notNull(),
    tipo: text("tipo").notNull().default("PESSOAL"),
    nome: text("nome").notNull().default("Meu painel"),
    configuracao: text("configuracao").notNull().default("{}"),
    versao: integer("versao").notNull().default(1),
    atualizadoPor: integer("atualizado_por").references(() => usuarios.id, {
      onDelete: "set null",
    }),
    criadoEm: text("criado_em").notNull().default(sql`CURRENT_TIMESTAMP`),
    atualizadoEm: text("atualizado_em").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("layouts_interface_scope_idx").on(
      table.comunidadeId,
      table.escopo,
    ),
    index("layouts_interface_usuario_idx").on(
      table.comunidadeId,
      table.usuarioId,
      table.tipo,
    ),
  ],
);

export const layoutsInterfaceHistorico = sqliteTable(
  "layouts_interface_historico",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    layoutId: integer("layout_id")
      .notNull()
      .references(() => layoutsInterface.id, { onDelete: "cascade" }),
    comunidadeId: integer("comunidade_id")
      .notNull()
      .references(() => comunidades.id, { onDelete: "cascade" }),
    usuarioId: integer("usuario_id").references(() => usuarios.id, {
      onDelete: "set null",
    }),
    acao: text("acao").notNull(),
    configuracaoAnterior: text("configuracao_anterior").notNull().default("{}"),
    configuracaoNova: text("configuracao_nova").notNull().default("{}"),
    revertido: integer("revertido", { mode: "boolean" })
      .notNull()
      .default(false),
    criadoEm: text("criado_em").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("layouts_interface_historico_layout_idx").on(
      table.layoutId,
      table.revertido,
      table.id,
    ),
    index("layouts_interface_historico_tenant_idx").on(
      table.comunidadeId,
      table.usuarioId,
      table.id,
    ),
  ],
);

export const feedbackPlataforma = sqliteTable(
  "feedback_plataforma",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    usuarioId: integer("usuario_id")
      .notNull()
      .references(() => usuarios.id, { onDelete: "restrict" }),
    comunidadeId: integer("comunidade_id").references(() => comunidades.id, {
      onDelete: "set null",
    }),
    tipo: text("tipo").notNull(),
    categoria: text("categoria").notNull(),
    mensagem: text("mensagem").notNull(),
    pagina: text("pagina").notNull().default(""),
    entidadeTipo: text("entidade_tipo").notNull().default(""),
    entidadeId: integer("entidade_id"),
    imagemChave: text("imagem_chave").notNull().default(""),
    imagemNome: text("imagem_nome").notNull().default(""),
    status: text("status").notNull().default("PENDENTE"),
    respostaProprietario: text("resposta_proprietario").notNull().default(""),
    respondidoPor: integer("respondido_por").references(() => usuarios.id, {
      onDelete: "set null",
    }),
    respondidoEm: text("respondido_em"),
    arquivadoEm: text("arquivado_em"),
    criadoEm: text("criado_em").notNull().default(sql`CURRENT_TIMESTAMP`),
    atualizadoEm: text("atualizado_em").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("feedback_plataforma_status_idx").on(table.status, table.criadoEm),
    index("feedback_plataforma_usuario_idx").on(table.usuarioId, table.criadoEm),
    index("feedback_plataforma_tipo_idx").on(table.tipo, table.categoria, table.criadoEm),
  ],
);

// Security metadata only: no file or chat payload is stored in these tables.
export const storageFiles = sqliteTable("storage_files", {
  id: text("id").primaryKey(), scope: text("scope").notNull(),
  ownerId: integer("owner_id").notNull().references(() => usuarios.id),
  fileId: text("file_id").notNull(), uploadedBy: integer("uploaded_by").references(() => usuarios.id),
  communityId: integer("community_id").references(() => comunidades.id),
  purpose: text("purpose").notNull().default(""), resourceId: integer("resource_id"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`), revokedAt: text("revoked_at"),
}, table => [index("storage_files_drive_idx").on(table.ownerId, table.fileId)]);
export const authRateLimits = sqliteTable("auth_rate_limits", {
  key: text("key").primaryKey(), attempts: integer("attempts").notNull().default(0),
  windowStart: integer("window_start").notNull(),
});
export const storageMigrationCopies = sqliteTable("storage_migration_copies", {
  sourceKey: text("source_key").primaryKey(), destination: text("destination").notNull(),
  sha256: text("sha256").notNull(), verifiedAt: text("verified_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const storageMigrationLocks = sqliteTable("storage_migration_locks", {
  communityId: integer("community_id").primaryKey().references(() => comunidades.id),
  leaseId: text("lease_id").notNull(),
  expiresAt: integer("expires_at").notNull(),
});
