CREATE TABLE `eventos_comunidade` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`comunidade_id` integer NOT NULL,
	`titulo` text NOT NULL,
	`descricao` text DEFAULT '' NOT NULL,
	`categoria` text DEFAULT 'OUTRO' NOT NULL,
	`inicia_em` text NOT NULL,
	`termina_em` text,
	`local` text DEFAULT '' NOT NULL,
	`publico` integer DEFAULT false NOT NULL,
	`status` text DEFAULT 'RASCUNHO' NOT NULL,
	`capacidade` integer,
	`criado_por` integer,
	`atualizado_por` integer,
	`criado_em` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`atualizado_em` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`comunidade_id`) REFERENCES `comunidades`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`criado_por`) REFERENCES `usuarios`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`atualizado_por`) REFERENCES `usuarios`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `eventos_comunidade_status_data_idx` ON `eventos_comunidade` (`comunidade_id`,`status`,`inicia_em`,`id`);--> statement-breakpoint
CREATE INDEX `eventos_publicos_data_idx` ON `eventos_comunidade` (`publico`,`status`,`inicia_em`);--> statement-breakpoint
CREATE TABLE `confirmacoes_evento` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`evento_id` integer NOT NULL,
	`comunidade_id` integer NOT NULL,
	`usuario_id` integer NOT NULL,
	`status` text DEFAULT 'CONFIRMADO' NOT NULL,
	`criado_em` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`atualizado_em` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`evento_id`) REFERENCES `eventos_comunidade`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`comunidade_id`) REFERENCES `comunidades`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`usuario_id`) REFERENCES `usuarios`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `confirmacoes_evento_usuario_unique` ON `confirmacoes_evento` (`evento_id`,`usuario_id`);--> statement-breakpoint
CREATE INDEX `confirmacoes_evento_comunidade_status_idx` ON `confirmacoes_evento` (`comunidade_id`,`status`,`evento_id`);
