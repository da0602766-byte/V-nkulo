CREATE TABLE `escala_designacoes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`comunidade_id` integer NOT NULL,
	`escala_id` integer NOT NULL,
	`voluntario_id` integer NOT NULL,
	`usuario_id` integer NOT NULL,
	`funcao` text NOT NULL,
	`status` text DEFAULT 'PENDENTE' NOT NULL,
	`ativo` integer DEFAULT true NOT NULL,
	`resposta_em` text,
	`criado_em` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`atualizado_em` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`comunidade_id`) REFERENCES `comunidades`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`escala_id`) REFERENCES `escalas_ministerio`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`voluntario_id`) REFERENCES `ministerio_voluntarios`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`usuario_id`) REFERENCES `usuarios`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `escala_designacoes_voluntario_unique` ON `escala_designacoes` (`escala_id`,`voluntario_id`);--> statement-breakpoint
CREATE INDEX `escala_designacoes_comunidade_usuario_idx` ON `escala_designacoes` (`comunidade_id`,`usuario_id`,`ativo`,`status`);--> statement-breakpoint
CREATE TABLE `escalas_ministerio` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`comunidade_id` integer NOT NULL,
	`ministerio_id` integer NOT NULL,
	`titulo` text NOT NULL,
	`inicia_em` text NOT NULL,
	`termina_em` text NOT NULL,
	`local` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'RASCUNHO' NOT NULL,
	`observacoes` text DEFAULT '' NOT NULL,
	`criado_por` integer,
	`atualizado_por` integer,
	`criado_em` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`atualizado_em` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`comunidade_id`) REFERENCES `comunidades`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`ministerio_id`) REFERENCES `ministerios_comunidade`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`criado_por`) REFERENCES `usuarios`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`atualizado_por`) REFERENCES `usuarios`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `escalas_ministerio_status_data_idx` ON `escalas_ministerio` (`comunidade_id`,`status`,`inicia_em`,`id`);--> statement-breakpoint
CREATE INDEX `escalas_ministerio_ministerio_data_idx` ON `escalas_ministerio` (`comunidade_id`,`ministerio_id`,`inicia_em`);--> statement-breakpoint
CREATE TABLE `ministerio_voluntarios` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`comunidade_id` integer NOT NULL,
	`ministerio_id` integer NOT NULL,
	`usuario_id` integer NOT NULL,
	`funcao` text NOT NULL,
	`papel` text DEFAULT 'VOLUNTARIO' NOT NULL,
	`dias_disponiveis` text DEFAULT '[]' NOT NULL,
	`periodo_preferido` text DEFAULT 'FLEXIVEL' NOT NULL,
	`ativo` integer DEFAULT true NOT NULL,
	`criado_em` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`atualizado_em` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`comunidade_id`) REFERENCES `comunidades`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`ministerio_id`) REFERENCES `ministerios_comunidade`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`usuario_id`) REFERENCES `usuarios`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ministerio_voluntarios_usuario_unique` ON `ministerio_voluntarios` (`ministerio_id`,`usuario_id`);--> statement-breakpoint
CREATE INDEX `ministerio_voluntarios_comunidade_usuario_idx` ON `ministerio_voluntarios` (`comunidade_id`,`usuario_id`,`ativo`);--> statement-breakpoint
CREATE TABLE `ministerios_comunidade` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`comunidade_id` integer NOT NULL,
	`nome` text NOT NULL,
	`descricao` text DEFAULT '' NOT NULL,
	`categoria` text DEFAULT 'OUTRO' NOT NULL,
	`status` text DEFAULT 'ATIVO' NOT NULL,
	`criado_por` integer,
	`atualizado_por` integer,
	`criado_em` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`atualizado_em` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`comunidade_id`) REFERENCES `comunidades`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`criado_por`) REFERENCES `usuarios`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`atualizado_por`) REFERENCES `usuarios`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ministerios_comunidade_nome_unique` ON `ministerios_comunidade` (`comunidade_id`,`nome`);--> statement-breakpoint
CREATE INDEX `ministerios_comunidade_status_idx` ON `ministerios_comunidade` (`comunidade_id`,`status`,`nome`);