-- Contact Logging: Registro de cada contato realizado com visitante
CREATE TABLE `visitor_contacts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`comunidade_id` integer NOT NULL,
	`visitante_id` integer NOT NULL,
	`tipo` text NOT NULL,
	`canal` text DEFAULT 'OUTRO' NOT NULL,
	`resultado` text NOT NULL,
	`descricao` text DEFAULT '' NOT NULL,
	`duracao_minutos` integer,
	`proxima_acao` text,
	`responsavel_id` integer,
	`criado_em` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`atualizado_em` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`comunidade_id`) REFERENCES `comunidades`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`visitante_id`) REFERENCES `visitantes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`responsavel_id`) REFERENCES `usuarios`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `visitor_contacts_visitante_idx` ON `visitor_contacts` (`comunidade_id`,`visitante_id`,`criado_em`);
--> statement-breakpoint
CREATE INDEX `visitor_contacts_responsavel_idx` ON `visitor_contacts` (`responsavel_id`,`criado_em`);
