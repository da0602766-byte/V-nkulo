-- Metas e Objetivos: Rastreamento integrado ao calendário
CREATE TABLE IF NOT EXISTS `metas_objetivos` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`comunidade_id` integer NOT NULL,
	`usuario_id` integer NOT NULL,
	`titulo` text NOT NULL,
	`descricao` text DEFAULT '' NOT NULL,
	`categoria` text NOT NULL,
	`prioridade` text DEFAULT 'NORMAL' NOT NULL,
	`data_inicio` text NOT NULL,
	`data_alvo` text NOT NULL,
	`progresso_percentual` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'EM_PROGRESSO' NOT NULL,
	`metricas_chave` text,
	`resultado_final` text,
	`concluido_em` text,
	`criado_em` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`atualizado_em` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`comunidade_id`) REFERENCES `comunidades`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`usuario_id`) REFERENCES `usuarios`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `metas_usuario_idx` ON `metas_objetivos` (`comunidade_id`,`usuario_id`,`data_alvo`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `metas_status_idx` ON `metas_objetivos` (`status`,`comunidade_id`,`data_alvo`);
