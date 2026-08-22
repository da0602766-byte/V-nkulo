CREATE TABLE `solicitacoes_entrada_comunidade` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`comunidade_id` integer NOT NULL,
	`usuario_id` integer NOT NULL,
	`mensagem` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'PENDENTE' NOT NULL,
	`analisado_por` integer,
	`solicitado_em` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`analisado_em` text,
	`atualizado_em` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`comunidade_id`) REFERENCES `comunidades`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`usuario_id`) REFERENCES `usuarios`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`analisado_por`) REFERENCES `usuarios`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `solicitacoes_entrada_usuario_comunidade_unique` ON `solicitacoes_entrada_comunidade` (`usuario_id`,`comunidade_id`);--> statement-breakpoint
CREATE INDEX `solicitacoes_entrada_comunidade_status_idx` ON `solicitacoes_entrada_comunidade` (`comunidade_id`,`status`,`solicitado_em`);--> statement-breakpoint
ALTER TABLE `comunidades` ADD `feed_publico_habilitado` integer DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `publicacoes_piloto` ADD `conteudo` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `publicacoes_piloto` ADD `categoria` text DEFAULT 'COMUNIDADE' NOT NULL;--> statement-breakpoint
ALTER TABLE `publicacoes_piloto` ADD `visibilidade` text DEFAULT 'COMUNIDADE' NOT NULL;--> statement-breakpoint
ALTER TABLE `publicacoes_piloto` ADD `criado_por` integer REFERENCES usuarios(id);--> statement-breakpoint
ALTER TABLE `publicacoes_piloto` ADD `atualizado_em` text DEFAULT '' NOT NULL;--> statement-breakpoint
UPDATE `publicacoes_piloto`
SET
  `conteudo` = CASE WHEN `conteudo` = '' THEN `resumo` ELSE `conteudo` END,
  `categoria` = 'COMUNIDADE',
  `visibilidade` = 'PLATAFORMA',
  `atualizado_em` = CURRENT_TIMESTAMP
WHERE `origem` = 'DEMO';
