ALTER TABLE `visitante_categorias` ADD `descricao` text DEFAULT '' NOT NULL;--> statement-breakpoint
CREATE TABLE `acessos_temporarios` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`comunidade_id` integer NOT NULL,
	`escala_id` integer NOT NULL,
	`designacao_id` integer NOT NULL,
	`beneficiario_usuario_id` integer NOT NULL,
	`recurso` text NOT NULL,
	`token_hash` text NOT NULL,
	`token_hint` text DEFAULT '' NOT NULL,
	`inicia_em` text NOT NULL,
	`termina_em` text NOT NULL,
	`status` text DEFAULT 'PENDENTE' NOT NULL,
	`autorizado_por` integer,
	`criado_por` integer,
	`ativado_em` text,
	`cancelado_por` integer,
	`cancelado_em` text,
	`negado_por` integer,
	`negado_em` text,
	`motivo_negacao` text DEFAULT '' NOT NULL,
	`expirado_em` text,
	`criado_em` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`atualizado_em` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`comunidade_id`) REFERENCES `comunidades`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`escala_id`) REFERENCES `escalas_ministerio`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`designacao_id`) REFERENCES `escala_designacoes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`beneficiario_usuario_id`) REFERENCES `usuarios`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`autorizado_por`) REFERENCES `usuarios`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`criado_por`) REFERENCES `usuarios`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`cancelado_por`) REFERENCES `usuarios`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`negado_por`) REFERENCES `usuarios`(`id`) ON UPDATE no action ON DELETE set null
);--> statement-breakpoint
CREATE UNIQUE INDEX `acessos_temporarios_token_hash_unique` ON `acessos_temporarios` (`token_hash`);--> statement-breakpoint
CREATE INDEX `acessos_temporarios_escala_status_idx` ON `acessos_temporarios` (`comunidade_id`,`escala_id`,`status`);--> statement-breakpoint
CREATE INDEX `acessos_temporarios_usuario_status_idx` ON `acessos_temporarios` (`beneficiario_usuario_id`,`comunidade_id`,`status`,`termina_em`);
