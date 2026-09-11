CREATE TABLE `agenda_compromissos` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`comunidade_id` integer NOT NULL,
	`usuario_id` integer NOT NULL,
	`titulo` text NOT NULL,
	`descricao` text DEFAULT '' NOT NULL,
	`categoria` text DEFAULT 'PESSOAL' NOT NULL,
	`inicia_em` text NOT NULL,
	`termina_em` text,
	`local` text DEFAULT '' NOT NULL,
	`dia_inteiro` integer DEFAULT false NOT NULL,
	`visibilidade` text DEFAULT 'PRIVADO' NOT NULL,
	`concluido` integer DEFAULT false NOT NULL,
	`criado_em` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`atualizado_em` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`comunidade_id`) REFERENCES `comunidades`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`usuario_id`) REFERENCES `usuarios`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `agenda_compromissos_periodo_idx` ON `agenda_compromissos` (`comunidade_id`,`usuario_id`,`inicia_em`);
