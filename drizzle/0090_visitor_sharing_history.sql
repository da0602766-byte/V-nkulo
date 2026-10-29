CREATE TABLE `visitante_acesso_historico` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`operacao` text NOT NULL,
	`comunidade_id` integer NOT NULL,
	`autor_id` integer,
	`membro_id` integer,
	`acao` text NOT NULL,
	`papel_anterior` text,
	`papel` text,
	`criado_em` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`comunidade_id`) REFERENCES `comunidades`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`autor_id`) REFERENCES `usuarios`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`membro_id`) REFERENCES `usuarios`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "visitor_share_history_action" CHECK("visitante_acesso_historico"."acao" IN ('CONCEDIDO','ALTERADO','REMOVIDO')),
	CONSTRAINT "visitor_share_history_role" CHECK("visitante_acesso_historico"."papel" IS NULL OR "visitante_acesso_historico"."papel" IN ('READ','EDIT')),
	CONSTRAINT "visitor_share_history_previous" CHECK("visitante_acesso_historico"."papel_anterior" IS NULL OR "visitante_acesso_historico"."papel_anterior" IN ('READ','EDIT'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `visitante_acesso_historico_operacao_unique` ON `visitante_acesso_historico` (`operacao`);--> statement-breakpoint
CREATE INDEX `visitor_share_history_community` ON `visitante_acesso_historico` (`comunidade_id`,`id`);--> statement-breakpoint
CREATE INDEX `visitor_share_history_expiry` ON `visitante_acesso_historico` (`criado_em`);