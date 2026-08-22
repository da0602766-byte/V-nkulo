CREATE TABLE IF NOT EXISTS `diaconia_checklist_itens` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`comunidade_id` integer NOT NULL,
	`escala_id` integer NOT NULL,
	`designacao_id` integer,
	`tarefa` text NOT NULL,
	`status` text DEFAULT 'PENDENTE' NOT NULL,
	`substituto_usuario_id` integer,
	`substituto_externo_nome` text DEFAULT '' NOT NULL,
	`observacao` text DEFAULT '' NOT NULL,
	`atualizado_por` integer,
	`criado_em` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`atualizado_em` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`comunidade_id`) REFERENCES `comunidades`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`escala_id`) REFERENCES `escalas_ministerio`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`designacao_id`) REFERENCES `escala_designacoes`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`substituto_usuario_id`) REFERENCES `usuarios`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`atualizado_por`) REFERENCES `usuarios`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `diaconia_checklist_escala_idx` ON `diaconia_checklist_itens` (`comunidade_id`,`escala_id`,`status`,`id`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `diaconia_relatorios` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`comunidade_id` integer NOT NULL,
	`escala_id` integer NOT NULL,
	`resumo` text NOT NULL,
	`status` text DEFAULT 'FINALIZADO' NOT NULL,
	`destinatarios_notificados` integer DEFAULT 0 NOT NULL,
	`encerrado_por` integer,
	`encerrado_em` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`atualizado_em` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`comunidade_id`) REFERENCES `comunidades`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`escala_id`) REFERENCES `escalas_ministerio`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`encerrado_por`) REFERENCES `usuarios`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `diaconia_relatorios_escala_unique` ON `diaconia_relatorios` (`escala_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `diaconia_relatorios_comunidade_idx` ON `diaconia_relatorios` (`comunidade_id`,`encerrado_em`,`id`);
