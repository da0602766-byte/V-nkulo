CREATE TABLE `programacoes_editoriais` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`comunidade_id` integer NOT NULL,
	`titulo` text NOT NULL,
	`mensagem` text NOT NULL,
	`categoria` text NOT NULL,
	`referencia` text DEFAULT '' NOT NULL,
	`imagem_url` text DEFAULT '' NOT NULL,
	`imagem_alt` text DEFAULT '' NOT NULL,
	`visibilidade` text DEFAULT 'PLATAFORMA' NOT NULL,
	`comentarios_habilitados` integer DEFAULT true NOT NULL,
	`status` text DEFAULT 'RASCUNHO' NOT NULL,
	`publicar_em` text NOT NULL,
	`autorizado_por` integer,
	`autorizado_em` text,
	`cancelado_por` integer,
	`cancelado_em` text,
	`publicacao_id` integer,
	`criado_por` integer,
	`criado_em` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`atualizado_em` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`comunidade_id`) REFERENCES `comunidades`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`autorizado_por`) REFERENCES `usuarios`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`cancelado_por`) REFERENCES `usuarios`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`publicacao_id`) REFERENCES `publicacoes_piloto`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`criado_por`) REFERENCES `usuarios`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `programacoes_editoriais_status_data_idx` ON `programacoes_editoriais` (`status`,`publicar_em`,`id`);--> statement-breakpoint
CREATE INDEX `programacoes_editoriais_comunidade_idx` ON `programacoes_editoriais` (`comunidade_id`,`status`,`publicar_em`);