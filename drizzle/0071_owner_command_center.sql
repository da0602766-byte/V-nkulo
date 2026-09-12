-- Centro de comando do Proprietário: planos configuráveis, assinaturas,
-- cobrança interna (sem acoplamento a gateway), cupons, central de
-- incidentes com agrupamento e contas excluídas com janela de restauração.
CREATE TABLE IF NOT EXISTS `planos_plataforma` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `nome` text NOT NULL,
  `slug` text NOT NULL,
  `descricao` text DEFAULT '' NOT NULL,
  `preco_centavos` integer DEFAULT 0 NOT NULL,
  `periodicidade` text DEFAULT 'MENSAL' NOT NULL,
  `limite_membros` integer DEFAULT 0 NOT NULL,
  `limite_armazenamento_mb` integer DEFAULT 0 NOT NULL,
  `modulos` text DEFAULT '[]' NOT NULL,
  `recursos` text DEFAULT '[]' NOT NULL,
  `dias_teste` integer DEFAULT 0 NOT NULL,
  `duracao_meses` integer DEFAULT 0 NOT NULL,
  `desconto_percentual` integer DEFAULT 0 NOT NULL,
  `regras` text DEFAULT '{}' NOT NULL,
  `comunidade_exclusiva_id` integer,
  `status` text DEFAULT 'ATIVO' NOT NULL,
  `criado_por` integer,
  `criado_em` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  `atualizado_em` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  FOREIGN KEY (`comunidade_exclusiva_id`) REFERENCES `comunidades`(`id`) ON UPDATE no action ON DELETE set null,
  FOREIGN KEY (`criado_por`) REFERENCES `usuarios`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `planos_plataforma_slug_unique` ON `planos_plataforma` (`slug`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `planos_plataforma_status_idx` ON `planos_plataforma` (`status`,`nome`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `assinaturas_comunidade` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `comunidade_id` integer NOT NULL,
  `plano_id` integer NOT NULL,
  `status` text DEFAULT 'ATIVA' NOT NULL,
  `inicia_em` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  `renova_em` text,
  `teste_ate` text,
  `carencia_ate` text,
  `cancelado_em` text,
  `encerrada_em` text,
  `cupom` text DEFAULT '' NOT NULL,
  `desconto_percentual` integer DEFAULT 0 NOT NULL,
  `renovacao_automatica` integer DEFAULT 1 NOT NULL,
  `observacoes` text DEFAULT '' NOT NULL,
  `criado_por` integer,
  `criado_em` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  `atualizado_em` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  FOREIGN KEY (`comunidade_id`) REFERENCES `comunidades`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`plano_id`) REFERENCES `planos_plataforma`(`id`) ON UPDATE no action ON DELETE restrict,
  FOREIGN KEY (`criado_por`) REFERENCES `usuarios`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `assinaturas_comunidade_status_idx` ON `assinaturas_comunidade` (`status`,`renova_em`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `assinaturas_comunidade_comunidade_idx` ON `assinaturas_comunidade` (`comunidade_id`,`status`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `cobrancas_assinatura` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `assinatura_id` integer NOT NULL,
  `comunidade_id` integer NOT NULL,
  `competencia` text NOT NULL,
  `valor_centavos` integer DEFAULT 0 NOT NULL,
  `desconto_centavos` integer DEFAULT 0 NOT NULL,
  `status` text DEFAULT 'PENDENTE' NOT NULL,
  `vence_em` text NOT NULL,
  `pago_em` text,
  `metodo` text DEFAULT '' NOT NULL,
  `provedor` text DEFAULT '' NOT NULL,
  `referencia_externa` text DEFAULT '' NOT NULL,
  `tentativas` integer DEFAULT 0 NOT NULL,
  `observacoes` text DEFAULT '' NOT NULL,
  `registrado_por` integer,
  `criado_em` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  `atualizado_em` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  FOREIGN KEY (`assinatura_id`) REFERENCES `assinaturas_comunidade`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`comunidade_id`) REFERENCES `comunidades`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`registrado_por`) REFERENCES `usuarios`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `cobrancas_assinatura_status_idx` ON `cobrancas_assinatura` (`status`,`vence_em`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `cobrancas_assinatura_comunidade_idx` ON `cobrancas_assinatura` (`comunidade_id`,`competencia`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `cupons_assinatura` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `codigo` text NOT NULL,
  `tipo` text DEFAULT 'PERCENTUAL' NOT NULL,
  `valor` integer DEFAULT 0 NOT NULL,
  `plano_id` integer,
  `valido_ate` text,
  `usos_maximos` integer DEFAULT 0 NOT NULL,
  `usos` integer DEFAULT 0 NOT NULL,
  `ativo` integer DEFAULT 1 NOT NULL,
  `criado_por` integer,
  `criado_em` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  FOREIGN KEY (`plano_id`) REFERENCES `planos_plataforma`(`id`) ON UPDATE no action ON DELETE set null,
  FOREIGN KEY (`criado_por`) REFERENCES `usuarios`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `cupons_assinatura_codigo_unique` ON `cupons_assinatura` (`codigo`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `incidentes_plataforma` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `chave_agrupamento` text NOT NULL,
  `titulo` text NOT NULL,
  `descricao` text DEFAULT '' NOT NULL,
  `area` text DEFAULT 'MODULO' NOT NULL,
  `modulo` text DEFAULT '' NOT NULL,
  `gravidade` text DEFAULT 'MEDIA' NOT NULL,
  `status` text DEFAULT 'ABERTO' NOT NULL,
  `prioridade` integer DEFAULT 3 NOT NULL,
  `ocorrencias` integer DEFAULT 1 NOT NULL,
  `comunidades_afetadas` integer DEFAULT 0 NOT NULL,
  `primeira_ocorrencia` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  `ultima_ocorrencia` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  `resolucao` text DEFAULT '' NOT NULL,
  `resolvido_por` integer,
  `resolvido_em` text,
  `criado_em` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  `atualizado_em` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  FOREIGN KEY (`resolvido_por`) REFERENCES `usuarios`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `incidentes_plataforma_chave_unique` ON `incidentes_plataforma` (`chave_agrupamento`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `incidentes_plataforma_status_idx` ON `incidentes_plataforma` (`status`,`gravidade`,`ultima_ocorrencia`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `incidente_ocorrencias` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `incidente_id` integer NOT NULL,
  `comunidade_id` integer,
  `usuario_id` integer,
  `detalhe` text DEFAULT '' NOT NULL,
  `contexto` text DEFAULT '{}' NOT NULL,
  `criado_em` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  FOREIGN KEY (`incidente_id`) REFERENCES `incidentes_plataforma`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`comunidade_id`) REFERENCES `comunidades`(`id`) ON UPDATE no action ON DELETE set null,
  FOREIGN KEY (`usuario_id`) REFERENCES `usuarios`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `incidente_ocorrencias_incidente_idx` ON `incidente_ocorrencias` (`incidente_id`,`criado_em`);
--> statement-breakpoint
-- Somente o mínimo administrativo/auditável: referência técnica, comunidade,
-- motivo e janela de restauração. Nenhum conteúdo pessoal é preservado aqui.
CREATE TABLE IF NOT EXISTS `contas_excluidas` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `referencia_tecnica` text NOT NULL,
  `usuario_id_original` integer NOT NULL,
  `comunidade_id` integer,
  `perfil` text DEFAULT '' NOT NULL,
  `motivo` text DEFAULT '' NOT NULL,
  `origem` text DEFAULT 'ADMINISTRATIVA' NOT NULL,
  `excluido_por` integer,
  `excluido_em` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  `restauravel_ate` text,
  `restaurado_em` text,
  `restaurado_por` integer,
  `purgado_em` text,
  FOREIGN KEY (`comunidade_id`) REFERENCES `comunidades`(`id`) ON UPDATE no action ON DELETE set null,
  FOREIGN KEY (`excluido_por`) REFERENCES `usuarios`(`id`) ON UPDATE no action ON DELETE set null,
  FOREIGN KEY (`restaurado_por`) REFERENCES `usuarios`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `contas_excluidas_referencia_unique` ON `contas_excluidas` (`referencia_tecnica`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `contas_excluidas_janela_idx` ON `contas_excluidas` (`restauravel_ate`,`purgado_em`);
--> statement-breakpoint
-- Fluxo de aprovação do Proprietário para redefinição de senha de Donos de
-- Comunidade, sobre a tabela já existente de redefinições.
ALTER TABLE `redefinicoes_senha` ADD `status` text DEFAULT 'SOLICITADO' NOT NULL;
--> statement-breakpoint
ALTER TABLE `redefinicoes_senha` ADD `comunidade_id` integer REFERENCES `comunidades`(`id`);
--> statement-breakpoint
ALTER TABLE `redefinicoes_senha` ADD `motivo` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `redefinicoes_senha` ADD `decisao_motivo` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `redefinicoes_senha` ADD `analisado_por` integer REFERENCES `usuarios`(`id`);
--> statement-breakpoint
ALTER TABLE `redefinicoes_senha` ADD `analisado_em` text;
--> statement-breakpoint
ALTER TABLE `redefinicoes_senha` ADD `enviado_em` text;
--> statement-breakpoint
ALTER TABLE `redefinicoes_senha` ADD `concluido_em` text;
--> statement-breakpoint
ALTER TABLE `redefinicoes_senha` ADD `tentativas` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `redefinicoes_senha_status_idx` ON `redefinicoes_senha` (`status`,`solicitado_em`);
