CREATE TABLE `ministerio_checklist_itens` (
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
CREATE INDEX `ministerio_checklist_escala_idx` ON `ministerio_checklist_itens` (`comunidade_id`,`escala_id`,`status`,`id`);--> statement-breakpoint
CREATE TABLE `ministerio_funcoes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`comunidade_id` integer NOT NULL,
	`ministerio_id` integer NOT NULL,
	`nome` text NOT NULL,
	`descricao` text DEFAULT '' NOT NULL,
	`ativa` integer DEFAULT true NOT NULL,
	`criado_por` integer,
	`criado_em` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`atualizado_em` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`comunidade_id`) REFERENCES `comunidades`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`ministerio_id`) REFERENCES `ministerios_comunidade`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`criado_por`) REFERENCES `usuarios`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ministerio_funcoes_nome_unique` ON `ministerio_funcoes` (`ministerio_id`,`nome`);--> statement-breakpoint
CREATE INDEX `ministerio_funcoes_comunidade_idx` ON `ministerio_funcoes` (`comunidade_id`,`ministerio_id`,`ativa`);--> statement-breakpoint
CREATE TABLE `ministerio_modelos_escala` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`comunidade_id` integer NOT NULL,
	`ministerio_id` integer NOT NULL,
	`nome` text NOT NULL,
	`titulo` text NOT NULL,
	`duracao_minutos` integer DEFAULT 120 NOT NULL,
	`local` text DEFAULT '' NOT NULL,
	`observacoes` text DEFAULT '' NOT NULL,
	`checklist_modelo` text DEFAULT '[]' NOT NULL,
	`ativo` integer DEFAULT true NOT NULL,
	`criado_por` integer,
	`criado_em` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`atualizado_em` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`comunidade_id`) REFERENCES `comunidades`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`ministerio_id`) REFERENCES `ministerios_comunidade`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`criado_por`) REFERENCES `usuarios`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ministerio_modelos_escala_nome_unique` ON `ministerio_modelos_escala` (`ministerio_id`,`nome`);--> statement-breakpoint
CREATE INDEX `ministerio_modelos_escala_comunidade_idx` ON `ministerio_modelos_escala` (`comunidade_id`,`ministerio_id`,`ativo`);--> statement-breakpoint
ALTER TABLE `ministerios_comunidade` ADD `youtube_url` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `ministerios_comunidade` ADD `spotify_url` text DEFAULT '' NOT NULL;