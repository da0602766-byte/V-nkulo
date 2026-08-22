CREATE TABLE `acessos_painel_pastoral` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`comunidade_id` integer NOT NULL,
	`usuario_id` integer NOT NULL,
	`concedido_por` integer NOT NULL,
	`ativo` integer DEFAULT true NOT NULL,
	`criado_em` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`atualizado_em` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`comunidade_id`) REFERENCES `comunidades`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`usuario_id`) REFERENCES `usuarios`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`concedido_por`) REFERENCES `usuarios`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `acessos_painel_pastoral_comunidade_usuario_unique` ON `acessos_painel_pastoral` (`comunidade_id`,`usuario_id`);--> statement-breakpoint
CREATE INDEX `acessos_painel_pastoral_usuario_idx` ON `acessos_painel_pastoral` (`usuario_id`,`ativo`);
--> statement-breakpoint
INSERT INTO `configuracoes` (`chave`, `valor`, `atualizado_por`, `atualizado_em`)
SELECT 'community_theme:' || c.id,
  '{"paletteId":"MODERNO","logoUrl":"","bannerUrl":""}',
  'migration-v4.7.3', CURRENT_TIMESTAMP
FROM `comunidades` c
WHERE NOT EXISTS (
  SELECT 1 FROM `configuracoes` cfg
  WHERE cfg.chave = 'community_theme:' || c.id
);
