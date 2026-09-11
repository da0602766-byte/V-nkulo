CREATE TABLE IF NOT EXISTS `avisos_promocao` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `comunidade_id` integer NOT NULL,
  `usuario_id` integer NOT NULL,
  `escopo` text DEFAULT 'COMUNIDADE' NOT NULL,
  `contexto` text DEFAULT '' NOT NULL,
  `papel_anterior` text DEFAULT '' NOT NULL,
  `papel_novo` text NOT NULL,
  `titulo` text DEFAULT '' NOT NULL,
  `destaques` text DEFAULT '[]' NOT NULL,
  `promovido_por` integer,
  `criado_em` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  `visto_em` text,
  FOREIGN KEY (`comunidade_id`) REFERENCES `comunidades`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`usuario_id`) REFERENCES `usuarios`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`promovido_por`) REFERENCES `usuarios`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `avisos_promocao_pendentes_idx` ON `avisos_promocao` (`usuario_id`,`comunidade_id`,`visto_em`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `usuario_introducoes` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `usuario_id` integer NOT NULL,
  `comunidade_id` integer DEFAULT 0 NOT NULL,
  `tipo` text NOT NULL,
  `status` text DEFAULT 'CONCLUIDA' NOT NULL,
  `etapa` integer DEFAULT 0 NOT NULL,
  `registrado_em` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  FOREIGN KEY (`usuario_id`) REFERENCES `usuarios`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `usuario_introducoes_unique` ON `usuario_introducoes` (`usuario_id`,`tipo`,`comunidade_id`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `ministerio_biblioteca_itens` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `comunidade_id` integer NOT NULL,
  `ministerio_id` integer NOT NULL,
  `titulo` text NOT NULL,
  `ativo` integer DEFAULT true NOT NULL,
  `criado_por` integer,
  `criado_em` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  `atualizado_em` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  FOREIGN KEY (`comunidade_id`) REFERENCES `comunidades`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`ministerio_id`) REFERENCES `ministerios_comunidade`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`criado_por`) REFERENCES `usuarios`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `ministerio_biblioteca_itens_idx` ON `ministerio_biblioteca_itens` (`comunidade_id`,`ministerio_id`,`ativo`);
--> statement-breakpoint
ALTER TABLE `ministerio_links_reutilizaveis` ADD COLUMN `item_id` integer REFERENCES `ministerio_biblioteca_itens`(`id`);
--> statement-breakpoint
INSERT INTO `ministerio_biblioteca_itens`
  (`comunidade_id`, `ministerio_id`, `titulo`, `ativo`, `criado_por`)
SELECT `comunidade_id`, `ministerio_id`, `titulo`, 1, MIN(`criado_por`)
FROM `ministerio_links_reutilizaveis`
WHERE `ativo` = 1
GROUP BY `comunidade_id`, `ministerio_id`, `titulo`;
--> statement-breakpoint
UPDATE `ministerio_links_reutilizaveis`
SET `item_id` = (
  SELECT `i`.`id` FROM `ministerio_biblioteca_itens` `i`
  WHERE `i`.`ministerio_id` = `ministerio_links_reutilizaveis`.`ministerio_id`
    AND `i`.`titulo` = `ministerio_links_reutilizaveis`.`titulo`
  LIMIT 1
)
WHERE `ativo` = 1;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `ministerio_links_reutilizaveis_item_idx` ON `ministerio_links_reutilizaveis` (`item_id`,`ativo`);
