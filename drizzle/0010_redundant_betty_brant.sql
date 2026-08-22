CREATE TABLE `notificacoes_lidas` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`notificacao_id` integer NOT NULL,
	`usuario_id` integer NOT NULL,
	`lida_em` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`notificacao_id`) REFERENCES `notificacoes_sistema`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`usuario_id`) REFERENCES `usuarios`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `notificacoes_lidas_usuario_notificacao_unique` ON `notificacoes_lidas` (`usuario_id`,`notificacao_id`);--> statement-breakpoint
CREATE TABLE `notificacoes_sistema` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`tipo` text DEFAULT 'INFO' NOT NULL,
	`titulo` text NOT NULL,
	`mensagem` text NOT NULL,
	`area` text DEFAULT 'MENU' NOT NULL,
	`entidade_id` integer,
	`criado_por` text NOT NULL,
	`criado_em` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
ALTER TABLE `ministerio_modulos` ADD `conteudo` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `ministerio_modulos` ADD `cor` text DEFAULT '#17877f' NOT NULL;