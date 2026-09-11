CREATE TABLE `redefinicoes_senha` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`usuario_id` integer NOT NULL,
	`solicitado_em` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`token_hash` text,
	`expira_em` text,
	`usado` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`usuario_id`) REFERENCES `usuarios`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `sessoes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`usuario_id` integer NOT NULL,
	`token_hash` text NOT NULL,
	`expira_em` text NOT NULL,
	`criado_em` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`usuario_id`) REFERENCES `usuarios`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sessoes_token_hash_unique` ON `sessoes` (`token_hash`);--> statement-breakpoint
ALTER TABLE `usuarios` ADD `senha_hash` text;--> statement-breakpoint
ALTER TABLE `usuarios` ADD `senha_salt` text;--> statement-breakpoint
ALTER TABLE `usuarios` ADD `tentativas_login` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `usuarios` ADD `bloqueado_ate` text;