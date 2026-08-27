ALTER TABLE `estacionamento_vagas` ADD `posicao_x` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `estacionamento_vagas` ADD `posicao_y` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
CREATE TABLE `estacionamento_reservas` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `comunidade_id` integer NOT NULL,
  `vaga_id` integer NOT NULL,
  `usuario_id` integer NOT NULL,
  `nome_completo` text NOT NULL,
  `email` text NOT NULL,
  `telefone` text DEFAULT '' NOT NULL,
  `documento_hash` text NOT NULL,
  `documento_mascarado` text NOT NULL,
  `inicio_em` text NOT NULL,
  `fim_em` text NOT NULL,
  `codigo` text NOT NULL,
  `status` text DEFAULT 'PENDENTE' NOT NULL,
  `confirmado_por` integer,
  `checkin_em` text,
  `criado_em` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  `atualizado_em` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  FOREIGN KEY (`comunidade_id`) REFERENCES `comunidades`(`id`) ON DELETE cascade,
  FOREIGN KEY (`vaga_id`) REFERENCES `estacionamento_vagas`(`id`) ON DELETE restrict,
  FOREIGN KEY (`usuario_id`) REFERENCES `usuarios`(`id`) ON DELETE cascade,
  FOREIGN KEY (`confirmado_por`) REFERENCES `usuarios`(`id`) ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `estacionamento_reserva_codigo_unique` ON `estacionamento_reservas` (`codigo`);
--> statement-breakpoint
CREATE INDEX `estacionamento_reserva_comunidade_status_idx` ON `estacionamento_reservas` (`comunidade_id`,`status`,`inicio_em`);
--> statement-breakpoint
CREATE INDEX `estacionamento_reserva_usuario_idx` ON `estacionamento_reservas` (`comunidade_id`,`usuario_id`,`inicio_em`);
--> statement-breakpoint
CREATE TABLE `estacionamento_relatorios_escala` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `comunidade_id` integer NOT NULL,
  `escala_id` integer NOT NULL,
  `usuario_id` integer NOT NULL,
  `resumo` text DEFAULT '' NOT NULL,
  `entradas` integer DEFAULT 0 NOT NULL,
  `saidas` integer DEFAULT 0 NOT NULL,
  `ocorrencias` integer DEFAULT 0 NOT NULL,
  `status` text DEFAULT 'AGUARDANDO_MEMBRO' NOT NULL,
  `revisado_por` integer,
  `enviado_pastor_em` text,
  `criado_em` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  `atualizado_em` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  FOREIGN KEY (`comunidade_id`) REFERENCES `comunidades`(`id`) ON DELETE cascade,
  FOREIGN KEY (`escala_id`) REFERENCES `escalas_ministerio`(`id`) ON DELETE cascade,
  FOREIGN KEY (`usuario_id`) REFERENCES `usuarios`(`id`) ON DELETE cascade,
  FOREIGN KEY (`revisado_por`) REFERENCES `usuarios`(`id`) ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `estacionamento_relatorio_escala_usuario_unique` ON `estacionamento_relatorios_escala` (`escala_id`,`usuario_id`);
--> statement-breakpoint
CREATE INDEX `estacionamento_relatorio_comunidade_status_idx` ON `estacionamento_relatorios_escala` (`comunidade_id`,`status`,`atualizado_em`);

