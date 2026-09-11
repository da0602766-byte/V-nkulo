CREATE TABLE `conversas_privadas` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`comunidade_id` integer NOT NULL,
	`usuario_menor_id` integer NOT NULL,
	`usuario_maior_id` integer NOT NULL,
	`ciclo_mes` text NOT NULL,
	`atualizado_em` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`criado_em` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`comunidade_id`) REFERENCES `comunidades`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`usuario_menor_id`) REFERENCES `usuarios`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`usuario_maior_id`) REFERENCES `usuarios`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `conversas_privadas_par_ciclo_unique` ON `conversas_privadas` (`comunidade_id`,`usuario_menor_id`,`usuario_maior_id`,`ciclo_mes`);--> statement-breakpoint
CREATE INDEX `conversas_privadas_usuario_menor_idx` ON `conversas_privadas` (`comunidade_id`,`usuario_menor_id`,`atualizado_em`);--> statement-breakpoint
CREATE INDEX `conversas_privadas_usuario_maior_idx` ON `conversas_privadas` (`comunidade_id`,`usuario_maior_id`,`atualizado_em`);--> statement-breakpoint
CREATE TABLE `mensagens_privadas` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`conversa_id` integer NOT NULL,
	`remetente_id` integer NOT NULL,
	`mensagem` text NOT NULL,
	`lida_em` text,
	`criado_em` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`conversa_id`) REFERENCES `conversas_privadas`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`remetente_id`) REFERENCES `usuarios`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `mensagens_privadas_conversa_idx` ON `mensagens_privadas` (`conversa_id`,`criado_em`,`id`);--> statement-breakpoint
CREATE INDEX `mensagens_privadas_remetente_lida_idx` ON `mensagens_privadas` (`remetente_id`,`lida_em`);--> statement-breakpoint
ALTER TABLE `notificacoes_sistema` ADD `comunidade_id` integer REFERENCES comunidades(id);--> statement-breakpoint
ALTER TABLE `notificacoes_sistema` ADD `remetente_usuario_id` integer REFERENCES usuarios(id);--> statement-breakpoint
ALTER TABLE `notificacoes_sistema` ADD `destino_rota` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `notificacoes_sistema` ADD `hierarquia` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `notificacoes_sistema` ADD `ministerio` text DEFAULT '' NOT NULL;