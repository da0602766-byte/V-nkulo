CREATE TABLE `estacionamento_cenas` (
	`comunidade_id` integer PRIMARY KEY NOT NULL,
	`revisao` integer DEFAULT 0 NOT NULL,
	`rascunho` text,
	`publicada` text,
	`token` text,
	`atualizado_por` integer,
	`atualizado_em` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`comunidade_id`) REFERENCES `comunidades`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`atualizado_por`) REFERENCES `usuarios`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `estacionamento_cenas_historico` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`comunidade_id` integer NOT NULL,
	`revisao` integer NOT NULL,
	`cena` text NOT NULL,
	`criado_por` integer,
	`criado_em` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`comunidade_id`) REFERENCES `comunidades`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`criado_por`) REFERENCES `usuarios`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `estacionamento_cenas_historico_comunidade` ON `estacionamento_cenas_historico` (`comunidade_id`,`id`);--> statement-breakpoint
ALTER TABLE `estacionamento_setores` ADD `scene_key` text;--> statement-breakpoint
CREATE UNIQUE INDEX `estacionamento_setor_scene_key` ON `estacionamento_setores` (`comunidade_id`,`scene_key`);--> statement-breakpoint
ALTER TABLE `estacionamento_vagas` ADD `scene_key` text;--> statement-breakpoint
CREATE UNIQUE INDEX `estacionamento_vaga_scene_key` ON `estacionamento_vagas` (`comunidade_id`,`scene_key`);