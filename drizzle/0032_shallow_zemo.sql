CREATE TABLE `presencas_comunidade` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`usuario_id` integer NOT NULL,
	`comunidade_id` integer NOT NULL,
	`ultima_atividade` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`exibir_ultima_atividade` integer DEFAULT true NOT NULL,
	FOREIGN KEY (`usuario_id`) REFERENCES `usuarios`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`comunidade_id`) REFERENCES `comunidades`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `presencas_comunidade_usuario_comunidade_unique` ON `presencas_comunidade` (`usuario_id`,`comunidade_id`);--> statement-breakpoint
CREATE INDEX `presencas_comunidade_comunidade_atividade_idx` ON `presencas_comunidade` (`comunidade_id`,`ultima_atividade`);