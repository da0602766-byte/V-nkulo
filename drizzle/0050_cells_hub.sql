ALTER TABLE `celulas` ADD `dias_reuniao` text DEFAULT '[]' NOT NULL;
--> statement-breakpoint
ALTER TABLE `celulas` ADD `endereco_publico` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `celulas` ADD `descricao_publica` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `celulas` ADD `lider_usuario_id` integer REFERENCES usuarios(id) ON DELETE set null;
--> statement-breakpoint
ALTER TABLE `celulas` ADD `vice_lider_usuario_id` integer REFERENCES usuarios(id) ON DELETE set null;
--> statement-breakpoint
ALTER TABLE `celulas` ADD `ultimo_relatorio_em` text;
--> statement-breakpoint
ALTER TABLE `celulas` ADD `arquivada_em` text;
--> statement-breakpoint
CREATE TABLE `celula_agenda` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`comunidade_id` integer NOT NULL,
	`celula_id` integer NOT NULL,
	`titulo` text NOT NULL,
	`inicia_em` text NOT NULL,
	`termina_em` text NOT NULL,
	`lembrete` text DEFAULT '' NOT NULL,
	`visibilidade` text DEFAULT 'PUBLICO' NOT NULL,
	`criado_por_usuario_id` integer,
	`criado_em` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`celula_id`) REFERENCES `celulas`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`criado_por_usuario_id`) REFERENCES `usuarios`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `celula_agenda_comunidade_celula_inicio_idx` ON `celula_agenda` (`comunidade_id`,`celula_id`,`inicia_em`);
--> statement-breakpoint
CREATE TABLE `celula_relatorios` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`comunidade_id` integer NOT NULL,
	`celula_id` integer NOT NULL,
	`data_reuniao` text NOT NULL,
	`aconteceu` integer DEFAULT true NOT NULL,
	`presentes` integer DEFAULT 0 NOT NULL,
	`visitantes` integer DEFAULT 0 NOT NULL,
	`observacoes` text DEFAULT '' NOT NULL,
	`enviado_por_usuario_id` integer,
	`criado_em` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`celula_id`) REFERENCES `celulas`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`enviado_por_usuario_id`) REFERENCES `usuarios`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `celula_relatorios_celula_data_unique` ON `celula_relatorios` (`celula_id`,`data_reuniao`);
--> statement-breakpoint
CREATE INDEX `celula_relatorios_comunidade_data_idx` ON `celula_relatorios` (`comunidade_id`,`data_reuniao`);
--> statement-breakpoint
CREATE TABLE `celula_solicitacoes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`comunidade_id` integer NOT NULL,
	`celula_id` integer NOT NULL,
	`usuario_id` integer,
	`nome` text NOT NULL,
	`contato` text DEFAULT '' NOT NULL,
	`mensagem` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'PENDENTE' NOT NULL,
	`criado_em` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`atualizado_em` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`celula_id`) REFERENCES `celulas`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`usuario_id`) REFERENCES `usuarios`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `celula_solicitacoes_comunidade_celula_status_idx` ON `celula_solicitacoes` (`comunidade_id`,`celula_id`,`status`);
--> statement-breakpoint
PRAGMA optimize;
