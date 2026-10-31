CREATE TABLE `louvor_compartilhamentos` (
	`comunidade_id` integer NOT NULL,
	`dono_id` integer NOT NULL,
	`destinatario_id` integer NOT NULL,
	`status` text DEFAULT 'PENDENTE' NOT NULL,
	PRIMARY KEY(`comunidade_id`, `dono_id`, `destinatario_id`),
	FOREIGN KEY (`comunidade_id`) REFERENCES `comunidades`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`dono_id`) REFERENCES `usuarios`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`destinatario_id`) REFERENCES `usuarios`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "louvor_share_status" CHECK("louvor_compartilhamentos"."status" IN ('PENDENTE','APROVADO','RECUSADO','REVOGADO'))
);
--> statement-breakpoint
CREATE TABLE `louvor_musicas_pessoais` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`usuario_id` integer NOT NULL,
	`titulo` text NOT NULL,
	`chave` text NOT NULL,
	`links` text DEFAULT '[]' NOT NULL,
	`versao` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`usuario_id`) REFERENCES `usuarios`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `louvor_song_owner_key` ON `louvor_musicas_pessoais` (`usuario_id`,`chave`);--> statement-breakpoint
CREATE TABLE `ministerio_checklist_modelos` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`comunidade_id` integer NOT NULL,
	`ministerio_id` integer NOT NULL,
	`nome` text NOT NULL,
	`itens` text NOT NULL,
	`versao` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`comunidade_id`) REFERENCES `comunidades`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`ministerio_id`) REFERENCES `ministerios_comunidade`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `checklist_models_ministry` ON `ministerio_checklist_modelos` (`comunidade_id`,`ministerio_id`);