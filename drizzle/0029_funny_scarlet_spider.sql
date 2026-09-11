CREATE TABLE `solicitacoes_comunidade` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`comunidade_id` integer NOT NULL,
	`solicitante_id` integer NOT NULL,
	`tipo` text NOT NULL,
	`titulo` text NOT NULL,
	`descricao` text NOT NULL,
	`visibilidade` text DEFAULT 'GESTORES' NOT NULL,
	`status` text DEFAULT 'ABERTA' NOT NULL,
	`criado_em` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`atualizado_em` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`comunidade_id`) REFERENCES `comunidades`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`solicitante_id`) REFERENCES `usuarios`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `solicitacoes_comunidade_tenant_status_idx` ON `solicitacoes_comunidade` (`comunidade_id`,`status`,`id`);--> statement-breakpoint
CREATE INDEX `solicitacoes_comunidade_solicitante_idx` ON `solicitacoes_comunidade` (`comunidade_id`,`solicitante_id`,`id`);--> statement-breakpoint
ALTER TABLE `escalas_ministerio` ADD `modelo_snapshot` text DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE `escalas_ministerio` ADD `campos_respostas` text DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE `ministerio_modelos_escala` ADD `campos_personalizados` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `ministerio_modelos_escala` ADD `versao` integer DEFAULT 1 NOT NULL;