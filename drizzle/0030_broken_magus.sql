CREATE TABLE `layouts_interface` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`comunidade_id` integer NOT NULL,
	`usuario_id` integer,
	`escopo` text NOT NULL,
	`tipo` text DEFAULT 'PESSOAL' NOT NULL,
	`nome` text DEFAULT 'Meu painel' NOT NULL,
	`configuracao` text DEFAULT '{}' NOT NULL,
	`versao` integer DEFAULT 1 NOT NULL,
	`atualizado_por` integer,
	`criado_em` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`atualizado_em` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`comunidade_id`) REFERENCES `comunidades`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`usuario_id`) REFERENCES `usuarios`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`atualizado_por`) REFERENCES `usuarios`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `layouts_interface_scope_idx` ON `layouts_interface` (`comunidade_id`,`escopo`);--> statement-breakpoint
CREATE INDEX `layouts_interface_usuario_idx` ON `layouts_interface` (`comunidade_id`,`usuario_id`,`tipo`);--> statement-breakpoint
CREATE TABLE `layouts_interface_historico` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`layout_id` integer NOT NULL,
	`comunidade_id` integer NOT NULL,
	`usuario_id` integer,
	`acao` text NOT NULL,
	`configuracao_anterior` text DEFAULT '{}' NOT NULL,
	`configuracao_nova` text DEFAULT '{}' NOT NULL,
	`revertido` integer DEFAULT false NOT NULL,
	`criado_em` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`layout_id`) REFERENCES `layouts_interface`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`comunidade_id`) REFERENCES `comunidades`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`usuario_id`) REFERENCES `usuarios`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `layouts_interface_historico_layout_idx` ON `layouts_interface_historico` (`layout_id`,`revertido`,`id`);--> statement-breakpoint
CREATE INDEX `layouts_interface_historico_tenant_idx` ON `layouts_interface_historico` (`comunidade_id`,`usuario_id`,`id`);