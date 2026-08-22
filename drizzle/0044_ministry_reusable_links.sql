CREATE TABLE `ministerio_links_reutilizaveis` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`comunidade_id` integer NOT NULL,
	`ministerio_id` integer NOT NULL,
	`tipo` text NOT NULL,
	`titulo` text NOT NULL,
	`url` text NOT NULL,
	`ativo` integer DEFAULT true NOT NULL,
	`criado_por` integer,
	`criado_em` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`atualizado_em` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`comunidade_id`) REFERENCES `comunidades`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`ministerio_id`) REFERENCES `ministerios_comunidade`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`criado_por`) REFERENCES `usuarios`(`id`) ON UPDATE no action ON DELETE set null
);--> statement-breakpoint
CREATE UNIQUE INDEX `ministerio_links_reutilizaveis_url_unique` ON `ministerio_links_reutilizaveis` (`ministerio_id`,`url`);--> statement-breakpoint
CREATE INDEX `ministerio_links_reutilizaveis_comunidade_idx` ON `ministerio_links_reutilizaveis` (`comunidade_id`,`ministerio_id`,`ativo`);
