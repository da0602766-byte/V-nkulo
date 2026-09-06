ALTER TABLE `solicitacao_repositorio_itens` ADD `prioridade` text DEFAULT 'NORMAL' NOT NULL;
--> statement-breakpoint
ALTER TABLE `solicitacao_repositorio_itens` ADD `responsavel_atribuido_em` text;
--> statement-breakpoint
ALTER TABLE `solicitacao_repositorio_itens` ADD `primeiro_contato_em` text;
--> statement-breakpoint
ALTER TABLE `solicitacao_repositorio_itens` ADD `proximo_retorno_em` text;
--> statement-breakpoint
ALTER TABLE `solicitacao_repositorio_itens` ADD `visita_agendada_em` text;
--> statement-breakpoint
ALTER TABLE `solicitacao_repositorio_itens` ADD `resultado` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `solicitacoes_comunidade` ADD `preferencia_contato` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `solicitacoes_comunidade` ADD `disponibilidade` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `solicitacoes_comunidade` ADD `data_preferencial` text;
--> statement-breakpoint
ALTER TABLE `solicitacoes_comunidade` ADD `contato_autorizado` integer DEFAULT false NOT NULL;
--> statement-breakpoint
CREATE INDEX `solicitacao_repositorio_itens_retorno_idx` ON `solicitacao_repositorio_itens` (`comunidade_id`,`proximo_retorno_em`,`status`);
--> statement-breakpoint
CREATE TABLE `solicitacao_eventos` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`comunidade_id` integer NOT NULL,
	`item_id` integer NOT NULL,
	`solicitacao_id` integer NOT NULL,
	`tipo` text NOT NULL,
	`mensagem` text DEFAULT '' NOT NULL,
	`visivel_membro` integer DEFAULT false NOT NULL,
	`criado_por` integer,
	`criado_em` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`comunidade_id`) REFERENCES `comunidades`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`item_id`) REFERENCES `solicitacao_repositorio_itens`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`solicitacao_id`) REFERENCES `solicitacoes_comunidade`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`criado_por`) REFERENCES `usuarios`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `solicitacao_eventos_item_idx` ON `solicitacao_eventos` (`comunidade_id`,`item_id`,`criado_em`);
--> statement-breakpoint
CREATE INDEX `solicitacao_eventos_solicitacao_idx` ON `solicitacao_eventos` (`comunidade_id`,`solicitacao_id`,`visivel_membro`,`criado_em`);
