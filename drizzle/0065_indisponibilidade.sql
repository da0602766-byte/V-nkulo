-- Indisponibilidade: Bloqueios de datas/horários
CREATE TABLE IF NOT EXISTS `indisponibilidades` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`comunidade_id` integer NOT NULL,
	`usuario_id` integer NOT NULL,
	`titulo` text NOT NULL,
	`descricao` text DEFAULT '' NOT NULL,
	`data_inicio` text NOT NULL,
	`data_fim` text NOT NULL,
	`todo_dia` integer DEFAULT 1 NOT NULL,
	`hora_inicio` text,
	`hora_fim` text,
	`tipo` text DEFAULT 'UNAVAILABLE' NOT NULL,
	`bloqueio_escalas` integer DEFAULT 1 NOT NULL,
	`bloqueio_pessoal` integer DEFAULT 1 NOT NULL,
	`criado_em` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`atualizado_em` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`comunidade_id`) REFERENCES `comunidades`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`usuario_id`) REFERENCES `usuarios`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `indisponibilidades_usuario_idx` ON `indisponibilidades` (`comunidade_id`,`usuario_id`,`data_inicio`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `indisponibilidades_periodo_idx` ON `indisponibilidades` (`data_inicio`,`data_fim`,`comunidade_id`);
