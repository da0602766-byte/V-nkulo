CREATE TABLE `avisos` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`titulo` text NOT NULL,
	`resumo` text NOT NULL,
	`conteudo` text,
	`tipo` text DEFAULT 'AVISO' NOT NULL,
	`prioridade` text DEFAULT 'NORMAL' NOT NULL,
	`publicado` integer DEFAULT true NOT NULL,
	`publicado_por` text NOT NULL,
	`publicado_em` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `diaconias` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`titulo` text NOT NULL,
	`data_servico` text NOT NULL,
	`responsavel` text NOT NULL,
	`integrantes` text DEFAULT '[]' NOT NULL,
	`tarefas` text DEFAULT '[]' NOT NULL,
	`observacoes` text,
	`status` text DEFAULT 'PLANEJADA' NOT NULL,
	`criado_por` text NOT NULL,
	`criado_em` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `louvor_escalas` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`titulo` text NOT NULL,
	`data_culto` text NOT NULL,
	`horario` text,
	`local` text,
	`observacoes` text,
	`musicas` text DEFAULT '[]' NOT NULL,
	`integrantes` text DEFAULT '[]' NOT NULL,
	`criado_por` text NOT NULL,
	`criado_em` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `ministerio_modulos` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`nome` text NOT NULL,
	`slug` text NOT NULL,
	`descricao` text,
	`icone` text DEFAULT '◇' NOT NULL,
	`permissao` text DEFAULT 'MODULOS_PERSONALIZADOS_VER' NOT NULL,
	`campos` text DEFAULT '[]' NOT NULL,
	`ativo` integer DEFAULT true NOT NULL,
	`ordem` integer DEFAULT 0 NOT NULL,
	`criado_por` text NOT NULL,
	`criado_em` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ministerio_modulos_slug_unique` ON `ministerio_modulos` (`slug`);--> statement-breakpoint
CREATE TABLE `ministerio_registros` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`modulo_id` integer NOT NULL,
	`dados` text DEFAULT '{}' NOT NULL,
	`criado_por` text NOT NULL,
	`criado_em` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`modulo_id`) REFERENCES `ministerio_modulos`(`id`) ON UPDATE no action ON DELETE cascade
);
