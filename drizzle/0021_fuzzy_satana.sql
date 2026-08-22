CREATE TABLE `planos_rede` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`nome` text NOT NULL,
	`slug` text NOT NULL,
	`limite_afiliadas` integer DEFAULT 0 NOT NULL,
	`valor_futuro_centavos` integer DEFAULT 0 NOT NULL,
	`ativo` integer DEFAULT true NOT NULL,
	`criado_em` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `planos_rede_slug_unique` ON `planos_rede` (`slug`);--> statement-breakpoint
CREATE TABLE `rede_administradores` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`rede_id` integer NOT NULL,
	`usuario_id` integer NOT NULL,
	`papel` text DEFAULT 'NETWORK_ADMIN' NOT NULL,
	`regiao` text DEFAULT '' NOT NULL,
	`ativo` integer DEFAULT true NOT NULL,
	`inicia_em` text,
	`termina_em` text,
	`criado_por` integer,
	`criado_em` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`rede_id`) REFERENCES `redes_igrejas`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`usuario_id`) REFERENCES `usuarios`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`criado_por`) REFERENCES `usuarios`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `rede_administradores_usuario_unique` ON `rede_administradores` (`rede_id`,`usuario_id`);--> statement-breakpoint
CREATE INDEX `rede_administradores_acesso_idx` ON `rede_administradores` (`usuario_id`,`ativo`,`rede_id`);--> statement-breakpoint
CREATE TABLE `rede_unidades` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`rede_id` integer NOT NULL,
	`comunidade_id` integer NOT NULL,
	`tipo` text DEFAULT 'AFILIADA' NOT NULL,
	`regiao` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'ATIVA' NOT NULL,
	`responsavel_usuario_id` integer,
	`pastor_interino_usuario_id` integer,
	`restricao_nivel` integer DEFAULT 0 NOT NULL,
	`prazo_responsavel` text,
	`criado_por` integer,
	`criado_em` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`atualizado_em` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`rede_id`) REFERENCES `redes_igrejas`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`comunidade_id`) REFERENCES `comunidades`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`responsavel_usuario_id`) REFERENCES `usuarios`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`pastor_interino_usuario_id`) REFERENCES `usuarios`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`criado_por`) REFERENCES `usuarios`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `rede_unidades_comunidade_unique` ON `rede_unidades` (`comunidade_id`);--> statement-breakpoint
CREATE INDEX `rede_unidades_rede_tipo_idx` ON `rede_unidades` (`rede_id`,`tipo`,`status`);--> statement-breakpoint
CREATE TABLE `redes_igrejas` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`nome` text NOT NULL,
	`slug` text NOT NULL,
	`comunidade_mae_id` integer NOT NULL,
	`plano_id` integer,
	`status` text DEFAULT 'ATIVA' NOT NULL,
	`limite_afiliadas` integer DEFAULT 0 NOT NULL,
	`valor_futuro_centavos` integer DEFAULT 0 NOT NULL,
	`isenta` integer DEFAULT false NOT NULL,
	`teste_inicio` text,
	`teste_fim` text,
	`status_comercial` text DEFAULT 'SEM_COBRANCA' NOT NULL,
	`criado_por` integer,
	`atualizado_por` integer,
	`criado_em` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`atualizado_em` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`comunidade_mae_id`) REFERENCES `comunidades`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`plano_id`) REFERENCES `planos_rede`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`criado_por`) REFERENCES `usuarios`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`atualizado_por`) REFERENCES `usuarios`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `redes_igrejas_slug_unique` ON `redes_igrejas` (`slug`);--> statement-breakpoint
CREATE UNIQUE INDEX `redes_igrejas_comunidade_mae_unique` ON `redes_igrejas` (`comunidade_mae_id`);