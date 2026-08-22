CREATE TABLE `comentarios_publicacao` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`publicacao_id` integer NOT NULL,
	`usuario_id` integer,
	`autor_nome_snapshot` text NOT NULL,
	`texto` text NOT NULL,
	`perfil_visivel` integer DEFAULT false NOT NULL,
	`status` text DEFAULT 'PUBLICADO' NOT NULL,
	`criado_em` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`atualizado_em` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`publicacao_id`) REFERENCES `publicacoes_piloto`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`usuario_id`) REFERENCES `usuarios`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `comentarios_publicacao_post_status_idx` ON `comentarios_publicacao` (`publicacao_id`,`status`,`criado_em`);--> statement-breakpoint
CREATE INDEX `comentarios_publicacao_usuario_idx` ON `comentarios_publicacao` (`usuario_id`,`criado_em`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_publicacoes_piloto` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`comunidade_id` integer,
	`titulo` text NOT NULL,
	`resumo` text NOT NULL,
	`conteudo` text DEFAULT '' NOT NULL,
	`categoria` text DEFAULT 'COMUNIDADE' NOT NULL,
	`visibilidade` text DEFAULT 'COMUNIDADE' NOT NULL,
	`status` text DEFAULT 'PUBLICADA' NOT NULL,
	`origem` text DEFAULT 'DEMO' NOT NULL,
	`comentarios_habilitados` integer DEFAULT true NOT NULL,
	`criado_por` integer,
	`criado_em` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`atualizado_em` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`comunidade_id`) REFERENCES `comunidades`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`criado_por`) REFERENCES `usuarios`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
INSERT INTO `__new_publicacoes_piloto`("id", "comunidade_id", "titulo", "resumo", "conteudo", "categoria", "visibilidade", "status", "origem", "comentarios_habilitados", "criado_por", "criado_em", "atualizado_em") SELECT "id", "comunidade_id", "titulo", "resumo", "conteudo", "categoria", "visibilidade", "status", "origem", 1, "criado_por", "criado_em", "atualizado_em" FROM `publicacoes_piloto`;--> statement-breakpoint
DROP TABLE `publicacoes_piloto`;--> statement-breakpoint
ALTER TABLE `__new_publicacoes_piloto` RENAME TO `publicacoes_piloto`;--> statement-breakpoint
PRAGMA foreign_keys=ON;
