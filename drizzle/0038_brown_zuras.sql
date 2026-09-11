CREATE TABLE `ministerio_equipe_membros` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`comunidade_id` integer NOT NULL,
	`ministerio_id` integer NOT NULL,
	`equipe_id` integer NOT NULL,
	`voluntario_id` integer NOT NULL,
	`criado_em` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`comunidade_id`) REFERENCES `comunidades`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`ministerio_id`) REFERENCES `ministerios_comunidade`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`equipe_id`) REFERENCES `ministerio_equipes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`voluntario_id`) REFERENCES `ministerio_voluntarios`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ministerio_equipe_membros_unique` ON `ministerio_equipe_membros` (`equipe_id`,`voluntario_id`);--> statement-breakpoint
CREATE INDEX `ministerio_equipe_membros_voluntario_idx` ON `ministerio_equipe_membros` (`comunidade_id`,`ministerio_id`,`voluntario_id`);--> statement-breakpoint
CREATE TABLE `ministerio_equipes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`comunidade_id` integer NOT NULL,
	`ministerio_id` integer NOT NULL,
	`nome` text NOT NULL,
	`descricao` text DEFAULT '' NOT NULL,
	`cor` text DEFAULT '#7357e8' NOT NULL,
	`ordem` integer DEFAULT 0 NOT NULL,
	`ativa` integer DEFAULT true NOT NULL,
	`criado_por` integer,
	`criado_em` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`atualizado_em` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`comunidade_id`) REFERENCES `comunidades`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`ministerio_id`) REFERENCES `ministerios_comunidade`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`criado_por`) REFERENCES `usuarios`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ministerio_equipes_nome_unique` ON `ministerio_equipes` (`ministerio_id`,`nome`);--> statement-breakpoint
CREATE INDEX `ministerio_equipes_comunidade_idx` ON `ministerio_equipes` (`comunidade_id`,`ministerio_id`,`ativa`,`ordem`);--> statement-breakpoint
CREATE TABLE `solicitacao_destinatarios` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`solicitacao_id` integer NOT NULL,
	`comunidade_id` integer NOT NULL,
	`usuario_id` integer NOT NULL,
	`notificado_em` text,
	`visualizado_em` text,
	`criado_em` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`solicitacao_id`) REFERENCES `solicitacoes_comunidade`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`comunidade_id`) REFERENCES `comunidades`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`usuario_id`) REFERENCES `usuarios`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `solicitacao_destinatarios_unique` ON `solicitacao_destinatarios` (`solicitacao_id`,`usuario_id`);--> statement-breakpoint
CREATE INDEX `solicitacao_destinatarios_usuario_idx` ON `solicitacao_destinatarios` (`comunidade_id`,`usuario_id`,`solicitacao_id`);--> statement-breakpoint
CREATE TABLE `solicitacao_publicos` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`solicitacao_id` integer NOT NULL,
	`comunidade_id` integer NOT NULL,
	`tipo` text NOT NULL,
	`referencia_id` integer,
	`referencia_texto` text DEFAULT '' NOT NULL,
	`criado_em` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`solicitacao_id`) REFERENCES `solicitacoes_comunidade`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`comunidade_id`) REFERENCES `comunidades`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `solicitacao_publicos_alvo_unique` ON `solicitacao_publicos` (`solicitacao_id`,`tipo`,`referencia_id`,`referencia_texto`);--> statement-breakpoint
CREATE INDEX `solicitacao_publicos_comunidade_idx` ON `solicitacao_publicos` (`comunidade_id`,`solicitacao_id`);--> statement-breakpoint
CREATE TABLE `visitante_categorias` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`comunidade_id` integer NOT NULL,
	`nome` text NOT NULL,
	`icone` text DEFAULT '◎' NOT NULL,
	`cor` text DEFAULT '#7357e8' NOT NULL,
	`ordem` integer DEFAULT 0 NOT NULL,
	`responsavel_usuario_id` integer,
	`ativa` integer DEFAULT true NOT NULL,
	`criado_por` integer,
	`criado_em` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`atualizado_em` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`comunidade_id`) REFERENCES `comunidades`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`responsavel_usuario_id`) REFERENCES `usuarios`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`criado_por`) REFERENCES `usuarios`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `visitante_categorias_comunidade_nome_unique` ON `visitante_categorias` (`comunidade_id`,`nome`);--> statement-breakpoint
CREATE INDEX `visitante_categorias_comunidade_ordem_idx` ON `visitante_categorias` (`comunidade_id`,`ativa`,`ordem`);--> statement-breakpoint
ALTER TABLE `escalas_ministerio` ADD `equipe_id` integer REFERENCES ministerio_equipes(id);--> statement-breakpoint
ALTER TABLE `visitantes` ADD `categoria_id` integer REFERENCES visitante_categorias(id);