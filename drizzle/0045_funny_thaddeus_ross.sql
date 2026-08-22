CREATE TABLE `solicitacao_repositorios` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`comunidade_id` integer NOT NULL,
	`tipo` text NOT NULL,
	`nome` text NOT NULL,
	`ministerio_id` integer,
	`status` text DEFAULT 'SUGERIDO' NOT NULL,
	`confirmado_por` integer,
	`confirmado_em` text,
	`criado_em` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`atualizado_em` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`comunidade_id`) REFERENCES `comunidades`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`ministerio_id`) REFERENCES `ministerios_comunidade`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`confirmado_por`) REFERENCES `usuarios`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `solicitacao_repositorios_tipo_unique` ON `solicitacao_repositorios` (`comunidade_id`,`tipo`);
--> statement-breakpoint
CREATE INDEX `solicitacao_repositorios_status_idx` ON `solicitacao_repositorios` (`comunidade_id`,`status`,`tipo`);
--> statement-breakpoint
CREATE TABLE `solicitacao_repositorio_itens` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`repositorio_id` integer NOT NULL,
	`comunidade_id` integer NOT NULL,
	`solicitacao_id` integer NOT NULL,
	`status` text DEFAULT 'ABERTO' NOT NULL,
	`encaminhado_por` integer,
	`criado_em` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`atualizado_em` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`repositorio_id`) REFERENCES `solicitacao_repositorios`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`comunidade_id`) REFERENCES `comunidades`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`solicitacao_id`) REFERENCES `solicitacoes_comunidade`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`encaminhado_por`) REFERENCES `usuarios`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `solicitacao_repositorio_itens_unique` ON `solicitacao_repositorio_itens` (`repositorio_id`,`solicitacao_id`);
--> statement-breakpoint
CREATE INDEX `solicitacao_repositorio_itens_status_idx` ON `solicitacao_repositorio_itens` (`comunidade_id`,`repositorio_id`,`status`);
--> statement-breakpoint
CREATE TABLE `pastor_whatsapp_preferencias` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`comunidade_id` integer NOT NULL,
	`usuario_id` integer NOT NULL,
	`disponivel` integer DEFAULT false NOT NULL,
	`atualizado_em` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`comunidade_id`) REFERENCES `comunidades`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`usuario_id`) REFERENCES `usuarios`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `pastor_whatsapp_preferencias_unique` ON `pastor_whatsapp_preferencias` (`comunidade_id`,`usuario_id`);
--> statement-breakpoint
CREATE INDEX `pastor_whatsapp_preferencias_disponivel_idx` ON `pastor_whatsapp_preferencias` (`comunidade_id`,`disponivel`);
