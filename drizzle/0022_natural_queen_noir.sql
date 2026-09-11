CREATE TABLE `retencoes_comunidade` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`comunidade_id` integer NOT NULL,
	`tipo` text NOT NULL,
	`motivo` text NOT NULL,
	`status` text DEFAULT 'ATIVA' NOT NULL,
	`criado_por` integer,
	`inicia_em` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`termina_em` text,
	`criado_em` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`comunidade_id`) REFERENCES `comunidades`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`criado_por`) REFERENCES `usuarios`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `retencoes_comunidade_status_idx` ON `retencoes_comunidade` (`comunidade_id`,`status`,`termina_em`);--> statement-breakpoint
CREATE TABLE `solicitacoes_ciclo_comunidade` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`comunidade_id` integer NOT NULL,
	`tipo` text NOT NULL,
	`status` text NOT NULL,
	`decisao` text DEFAULT 'PENDENTE' NOT NULL,
	`motivo` text NOT NULL,
	`categoria_motivo` text NOT NULL,
	`descricao` text NOT NULL,
	`evidencias` text DEFAULT '[]' NOT NULL,
	`evidencia_obrigatoria` integer DEFAULT false NOT NULL,
	`senha_reconfirmada` integer DEFAULT false NOT NULL,
	`mfa_status` text DEFAULT 'PENDENTE_EXTERNO' NOT NULL,
	`solicitante_id` integer NOT NULL,
	`analista_id` integer,
	`justificativa_analise` text,
	`bloqueios` text DEFAULT '[]' NOT NULL,
	`snapshot_configuracao` text DEFAULT '{}' NOT NULL,
	`solicitado_em` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`analisado_em` text,
	`atualizado_em` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`comunidade_id`) REFERENCES `comunidades`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`solicitante_id`) REFERENCES `usuarios`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`analista_id`) REFERENCES `usuarios`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `solicitacoes_ciclo_comunidade_status_idx` ON `solicitacoes_ciclo_comunidade` (`comunidade_id`,`status`,`solicitado_em`);--> statement-breakpoint
CREATE INDEX `solicitacoes_ciclo_analise_idx` ON `solicitacoes_ciclo_comunidade` (`decisao`,`status`,`solicitado_em`);