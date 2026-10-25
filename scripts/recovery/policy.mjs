// Closed inventory: new tables require a recovery review, even when empty.
export const DATA_TABLES = new Set(`
acessos_painel_pastoral acompanhamentos agenda_compromissos assinaturas_comunidade
auditoria_piloto aviso_comentarios aviso_reacoes avisos avisos_promocao blocos_texto
celula_agenda celula_relatorios celula_solicitacoes celulas comentarios_publicacao
comunidades confirmacoes_evento conversas_privadas culto_lancamentos culto_rotinas
diaconia_checklist_itens diaconia_equipes diaconia_relatorios diaconias
escala_designacoes escala_equipes escala_respostas escalas_ministerio
estacionamento_configuracoes estacionamento_movimentacoes estacionamento_ocorrencias
estacionamento_relatorios_escala estacionamento_reservas estacionamento_setores
estacionamento_vagas eventos_comunidade feature_flags feedback_plataforma fio_registros
identidades_cpf indisponibilidades laboratorio_experimentos laboratorio_versoes
layouts_interface layouts_interface_historico louvor_escalas mensagens_exibicao
mensagens_privadas metas_objetivos ministerio_biblioteca_itens ministerio_checklist_itens
ministerio_equipe_membros ministerio_equipes ministerio_funcoes ministerio_links_reutilizaveis
ministerio_modelos_escala ministerio_modulos ministerio_registros ministerio_voluntarios
ministerios_comunidade notificacoes_lidas notificacoes_sistema oficiais_comunidade
pastor_whatsapp_preferencias politicas_editoriais_ia presencas_comunidade programacoes_editoriais
publicacoes_piloto rascunhos_editoriais_ia reacoes_publicacao rede_administradores
rede_unidades redes_igrejas retencoes_comunidade solicitacao_destinatarios solicitacao_eventos
solicitacao_publicos solicitacao_repositorio_itens solicitacao_repositorios
solicitacoes_ciclo_comunidade solicitacoes_comunidade solicitacoes_criacao_comunidade
solicitacoes_entrada_comunidade solicitacoes_log1 storage_preferences teens_acompanhamentos
usuario_comunidades usuario_introducoes usuarios visitante_campos visitante_categorias
visitantes visitor_contacts visitor_visits
`.trim().split(/\s+/));

export const EXCLUDED_TABLES = new Set(`
acessos_temporarios cadastros_membros_temporarios community_drive_storage configuracoes
convites_comunidade google_connections google_native_handoffs links_cadastro_membros
links_contratacao mobile_checklist_versions mobile_module_grants mobile_module_receipts
mobile_visitor_receipts mobile_write_grants notificacoes_push_controle
notificacoes_push_dispositivos notificacoes_push_fila redefinicoes_senha sessoes
user_drive_storage user_file_copies visitante_drive visitante_drive_acessos visitante_acessos visitante_planilha
supabase_storage_copies
`.trim().split(/\s+/));

export const BASELINE_TABLES = new Set(['planos_plataforma', 'planos_rede', 'controlled_auth_rate_limits', 'auth_rate_limits']);
export const INTERNAL_TABLE = /^(sqlite_|_cf_|__drizzle)|^d1_migrations$/;
export const RESET_TABLES = new Set(['platform_reset_chunks', 'platform_reset_control', 'platform_reset_files', 'platform_reset_guard', 'platform_reset_history']);

export function recoveredRow(table, row) {
  const result = { ...row };
  if (table === 'usuarios') {
    result.senha_hash = null;
    result.senha_salt = null;
    result.ativo = 0;
  }
  if (table === 'solicitacoes_log1') {
    result.senha_hash = null;
    result.senha_salt = null;
  }
  if (table === 'escalas_ministerio') result.share_token = null;
  return result;
}
