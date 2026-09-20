CREATE TABLE `reacoes_publicacao` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `publicacao_id` integer NOT NULL REFERENCES `publicacoes_piloto`(`id`) ON DELETE cascade,
  `usuario_id` integer NOT NULL REFERENCES `usuarios`(`id`) ON DELETE cascade,
  `tipo` text NOT NULL CHECK (`tipo` IN ('AMEM', 'CORACAO', 'ORACAO', 'ALEGRIA')),
  `criado_em` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `reacoes_publicacao_unica_idx` ON `reacoes_publicacao` (`publicacao_id`,`usuario_id`,`tipo`);
--> statement-breakpoint
CREATE INDEX `reacoes_publicacao_post_idx` ON `reacoes_publicacao` (`publicacao_id`,`tipo`);
