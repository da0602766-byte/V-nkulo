CREATE TABLE `links_cadastro_membros` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`comunidade_origem_id` integer NOT NULL,
	`criado_por` integer NOT NULL,
	`token` text NOT NULL,
	`titulo` text DEFAULT 'Cadastro de membros' NOT NULL,
	`abre_em` text NOT NULL,
	`fecha_em` text NOT NULL,
	`status` text DEFAULT 'ATIVO' NOT NULL,
	`criado_em` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`atualizado_em` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`comunidade_origem_id`) REFERENCES `comunidades`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`criado_por`) REFERENCES `usuarios`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `links_cadastro_membros_token_unique` ON `links_cadastro_membros` (`token`);
--> statement-breakpoint
CREATE INDEX `links_cadastro_membros_criador_idx` ON `links_cadastro_membros` (`criado_por`,`status`,`fecha_em`);
--> statement-breakpoint
CREATE INDEX `links_cadastro_membros_comunidade_idx` ON `links_cadastro_membros` (`comunidade_origem_id`,`status`,`id`);
--> statement-breakpoint
CREATE TABLE `cadastros_membros_temporarios` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`link_id` integer NOT NULL,
	`comunidade_id` integer NOT NULL,
	`ministerio_id` integer NOT NULL,
	`nome_completo` text NOT NULL,
	`email` text NOT NULL,
	`cpf` text DEFAULT '' NOT NULL,
	`cep` text NOT NULL,
	`data_nascimento` text NOT NULL,
	`uncao` text NOT NULL,
	`foto_url` text DEFAULT '' NOT NULL,
	`ministerio_dados` text DEFAULT '{}' NOT NULL,
	`status` text DEFAULT 'PENDENTE' NOT NULL,
	`enviado_em` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`atualizado_em` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`link_id`) REFERENCES `links_cadastro_membros`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`comunidade_id`) REFERENCES `comunidades`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`ministerio_id`) REFERENCES `ministerios_comunidade`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `cadastros_membros_link_email_unique` ON `cadastros_membros_temporarios` (`link_id`,`email`);
--> statement-breakpoint
CREATE INDEX `cadastros_membros_comunidade_status_idx` ON `cadastros_membros_temporarios` (`comunidade_id`,`status`,`enviado_em`);
--> statement-breakpoint
CREATE INDEX `cadastros_membros_ministerio_idx` ON `cadastros_membros_temporarios` (`comunidade_id`,`ministerio_id`,`enviado_em`);
