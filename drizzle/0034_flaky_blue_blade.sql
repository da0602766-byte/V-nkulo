ALTER TABLE `comunidades` ADD `selo_pastoral_status` text DEFAULT 'APROVADO' NOT NULL;--> statement-breakpoint
ALTER TABLE `comunidades` ADD `pastor_responsavel_usuario_id` integer REFERENCES usuarios(id);--> statement-breakpoint
ALTER TABLE `comunidades` ADD `selo_pastoral_por` integer REFERENCES usuarios(id);--> statement-breakpoint
ALTER TABLE `comunidades` ADD `selo_pastoral_em` text;--> statement-breakpoint
ALTER TABLE `comunidades` ADD `ficha_criacao` text DEFAULT '{}' NOT NULL;