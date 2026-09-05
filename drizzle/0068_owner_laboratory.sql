CREATE TABLE IF NOT EXISTS `laboratorio_experimentos` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `autor_id` integer NOT NULL,
  `nome` text NOT NULL,
  `descricao` text DEFAULT '' NOT NULL,
  `status` text DEFAULT 'ATIVO' NOT NULL,
  `dispositivo_principal` text DEFAULT 'DESKTOP' NOT NULL,
  `documento` text DEFAULT '{"schema":1,"nodes":[],"css":"","profile":"PROPRIETARIO","state":"NORMAL"}' NOT NULL,
  `css` text DEFAULT '' NOT NULL,
  `versao` integer DEFAULT 1 NOT NULL,
  `criado_em` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  `atualizado_em` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  FOREIGN KEY (`autor_id`) REFERENCES `usuarios`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `laboratorio_experimentos_status_idx` ON `laboratorio_experimentos` (`status`,`atualizado_em`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `laboratorio_versoes` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `experimento_id` integer NOT NULL,
  `autor_id` integer NOT NULL,
  `rotulo` text NOT NULL,
  `documento` text NOT NULL,
  `css` text DEFAULT '' NOT NULL,
  `criado_em` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  FOREIGN KEY (`experimento_id`) REFERENCES `laboratorio_experimentos`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`autor_id`) REFERENCES `usuarios`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `laboratorio_versoes_experimento_idx` ON `laboratorio_versoes` (`experimento_id`,`id`);
