ALTER TABLE `escalas_ministerio` ADD `repertorio` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `escalas_ministerio` ADD `links_recursos` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `escalas_ministerio` ADD `responsavel_usuario_id` integer REFERENCES usuarios(id);--> statement-breakpoint
ALTER TABLE `escalas_ministerio` ADD `share_token` text;--> statement-breakpoint
ALTER TABLE `escalas_ministerio` ADD `compartilhado_em` text;--> statement-breakpoint
CREATE UNIQUE INDEX `escalas_ministerio_share_token_unique` ON `escalas_ministerio` (`share_token`);--> statement-breakpoint
ALTER TABLE `ministerios_comunidade` ADD `responsavel_usuario_id` integer REFERENCES usuarios(id);