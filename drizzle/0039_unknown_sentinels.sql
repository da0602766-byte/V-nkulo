CREATE TABLE `solicitacoes_criacao_comunidade` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`solicitante_id` integer NOT NULL,
	`nome` text NOT NULL,
	`descricao` text NOT NULL,
	`cidade` text NOT NULL,
	`email_institucional` text NOT NULL,
	`ficha_criacao` text DEFAULT '{}' NOT NULL,
	`status` text DEFAULT 'PENDENTE' NOT NULL,
	`observacao_proprietario` text DEFAULT '' NOT NULL,
	`analisado_por` integer,
	`analisado_em` text,
	`comunidade_id` integer,
	`criado_em` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`atualizado_em` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`solicitante_id`) REFERENCES `usuarios`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`analisado_por`) REFERENCES `usuarios`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`comunidade_id`) REFERENCES `comunidades`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `solicitacoes_criacao_status_idx` ON `solicitacoes_criacao_comunidade` (`status`,`criado_em`,`id`);--> statement-breakpoint
CREATE INDEX `solicitacoes_criacao_solicitante_idx` ON `solicitacoes_criacao_comunidade` (`solicitante_id`,`status`,`id`);