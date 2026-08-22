CREATE TABLE `culto_lancamentos` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`rotina_id` integer NOT NULL,
	`registrado_por_usuario_id` integer,
	`registrado_por_nome` text NOT NULL,
	`pessoas_culto` integer DEFAULT 0 NOT NULL,
	`visitantes` integer DEFAULT 0 NOT NULL,
	`cestas_basicas` integer DEFAULT 0 NOT NULL,
	`visitas_dia` integer DEFAULT 0 NOT NULL,
	`teens` integer DEFAULT 0 NOT NULL,
	`adultos` integer DEFAULT 0 NOT NULL,
	`jovens` integer DEFAULT 0 NOT NULL,
	`kids` integer DEFAULT 0 NOT NULL,
	`bebes` integer DEFAULT 0 NOT NULL,
	`extras` text DEFAULT '{}' NOT NULL,
	`observacoes` text,
	`criado_em` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`atualizado_em` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`rotina_id`) REFERENCES `culto_rotinas`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`registrado_por_usuario_id`) REFERENCES `usuarios`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `culto_rotinas` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`titulo` text NOT NULL,
	`data_culto` text NOT NULL,
	`horario` text,
	`equipe_id` integer,
	`registrador_usuario_id` integer,
	`campos_extras` text DEFAULT '[]' NOT NULL,
	`observacoes` text,
	`status` text DEFAULT 'ABERTA' NOT NULL,
	`criado_por` text NOT NULL,
	`criado_em` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`atualizado_em` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`equipe_id`) REFERENCES `diaconia_equipes`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`registrador_usuario_id`) REFERENCES `usuarios`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
ALTER TABLE `avisos` ADD `imagem` text;--> statement-breakpoint
ALTER TABLE `usuarios` ADD `tema_preferido` text DEFAULT 'CLARO' NOT NULL;