-- Pipeline de publicação com aprovação e rollback, e configurações globais
-- versionadas (feature flags com histórico, manutenção por módulo, versão
-- mínima de APK/PWA), tudo com reversão rápida.
CREATE TABLE IF NOT EXISTS `publicacoes_deploy` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `versao` text NOT NULL,
  `commit_sha` text DEFAULT '' NOT NULL,
  `branch` text DEFAULT '' NOT NULL,
  `autor` text DEFAULT '' NOT NULL,
  `mensagem` text DEFAULT '' NOT NULL,
  `ambiente` text DEFAULT 'PRODUCAO' NOT NULL,
  `status` text DEFAULT 'PENDENTE' NOT NULL,
  `etapa_atual` text DEFAULT 'COMMIT' NOT NULL,
  `iniciado_em` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  `concluido_em` text,
  `duracao_ms` integer DEFAULT 0 NOT NULL,
  `aprovacao_status` text DEFAULT 'PENDENTE' NOT NULL,
  `aprovado_por` integer,
  `aprovado_em` text,
  `aprovacao_motivo` text DEFAULT '' NOT NULL,
  `health_check` text DEFAULT '{}' NOT NULL,
  `rollback_de_id` integer,
  `rollback_motivo` text DEFAULT '' NOT NULL,
  `rollback_automatico` integer DEFAULT 0 NOT NULL,
  `observacoes` text DEFAULT '' NOT NULL,
  `registrado_por` integer,
  `criado_em` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  `atualizado_em` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  FOREIGN KEY (`aprovado_por`) REFERENCES `usuarios`(`id`) ON UPDATE no action ON DELETE set null,
  FOREIGN KEY (`registrado_por`) REFERENCES `usuarios`(`id`) ON UPDATE no action ON DELETE set null,
  FOREIGN KEY (`rollback_de_id`) REFERENCES `publicacoes_deploy`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `publicacoes_deploy_status_idx` ON `publicacoes_deploy` (`status`,`iniciado_em`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `publicacoes_deploy_versao_idx` ON `publicacoes_deploy` (`versao`,`ambiente`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `publicacao_etapas` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `deploy_id` integer NOT NULL,
  `etapa` text NOT NULL,
  `ordem` integer DEFAULT 0 NOT NULL,
  `status` text DEFAULT 'PENDENTE' NOT NULL,
  `iniciado_em` text,
  `concluido_em` text,
  `duracao_ms` integer DEFAULT 0 NOT NULL,
  `resultado` text DEFAULT '' NOT NULL,
  `logs` text DEFAULT '' NOT NULL,
  `criado_em` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  FOREIGN KEY (`deploy_id`) REFERENCES `publicacoes_deploy`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `publicacao_etapas_deploy_etapa_unique` ON `publicacao_etapas` (`deploy_id`,`etapa`);
--> statement-breakpoint
-- Configuração global versionada: cada alteração grava uma versão nova, e a
-- reversão rápida é reaplicar uma versão anterior em vez de reeditar à mão.
CREATE TABLE IF NOT EXISTS `configuracoes_globais` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `chave` text NOT NULL,
  `escopo_tipo` text DEFAULT 'GLOBAL' NOT NULL,
  `escopo_id` integer DEFAULT 0 NOT NULL,
  `valor` text DEFAULT '{}' NOT NULL,
  `versao` integer DEFAULT 1 NOT NULL,
  `critica` integer DEFAULT 0 NOT NULL,
  `alterado_por` integer,
  `motivo` text DEFAULT '' NOT NULL,
  `atualizado_em` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  FOREIGN KEY (`alterado_por`) REFERENCES `usuarios`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `configuracoes_globais_chave_escopo_unique` ON `configuracoes_globais` (`chave`,`escopo_tipo`,`escopo_id`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `configuracoes_globais_historico` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `configuracao_id` integer NOT NULL,
  `chave` text NOT NULL,
  `escopo_tipo` text DEFAULT 'GLOBAL' NOT NULL,
  `escopo_id` integer DEFAULT 0 NOT NULL,
  `valor_anterior` text DEFAULT '{}' NOT NULL,
  `valor_novo` text DEFAULT '{}' NOT NULL,
  `versao` integer DEFAULT 1 NOT NULL,
  `motivo` text DEFAULT '' NOT NULL,
  `alterado_por` integer,
  `criado_em` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  FOREIGN KEY (`configuracao_id`) REFERENCES `configuracoes_globais`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`alterado_por`) REFERENCES `usuarios`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `configuracoes_globais_historico_idx` ON `configuracoes_globais_historico` (`configuracao_id`,`criado_em`);
--> statement-breakpoint
-- Histórico das feature flags, para reverter uma liberação gradual sem
-- precisar lembrar o estado anterior.
CREATE TABLE IF NOT EXISTS `feature_flags_historico` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `flag_key` text NOT NULL,
  `escopo_tipo` text DEFAULT 'GLOBAL' NOT NULL,
  `escopo_id` integer DEFAULT 0 NOT NULL,
  `habilitado_anterior` integer DEFAULT 0 NOT NULL,
  `habilitado_novo` integer DEFAULT 0 NOT NULL,
  `config_anterior` text DEFAULT '{}' NOT NULL,
  `config_nova` text DEFAULT '{}' NOT NULL,
  `motivo` text DEFAULT '' NOT NULL,
  `alterado_por` integer,
  `criado_em` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  FOREIGN KEY (`alterado_por`) REFERENCES `usuarios`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `feature_flags_historico_idx` ON `feature_flags_historico` (`flag_key`,`escopo_tipo`,`escopo_id`,`criado_em`);
--> statement-breakpoint
-- Limites administrativos por comunidade (membros, armazenamento, etc.), em
-- JSON para acompanhar o que o plano define sem exigir migração a cada limite.
ALTER TABLE `comunidades` ADD `limites_json` text DEFAULT '{}' NOT NULL;
--> statement-breakpoint
ALTER TABLE `comunidades` ADD `manutencao_motivo` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `comunidades` ADD `manutencao_ate` text;
