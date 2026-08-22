CREATE TABLE IF NOT EXISTS `oficiais_comunidade` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`usuario_comunidade_id` integer NOT NULL,
	`titulo` text NOT NULL,
	`permissoes` text DEFAULT '' NOT NULL,
	`atualizado_por` integer,
	`criado_em` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`atualizado_em` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`usuario_comunidade_id`) REFERENCES `usuario_comunidades`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`atualizado_por`) REFERENCES `usuarios`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `oficiais_comunidade_vinculo_unique` ON `oficiais_comunidade` (`usuario_comunidade_id`);
