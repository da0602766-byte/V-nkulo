-- Confirmação de Escalas: Respostas dos designados
CREATE TABLE IF NOT EXISTS `escala_respostas` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`comunidade_id` integer NOT NULL,
	`escala_designacao_id` integer NOT NULL,
	`usuario_id` integer NOT NULL,
	`resposta` text NOT NULL,
	`motivo_recusa` text DEFAULT '' NOT NULL,
	`confirmado_em` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`notificado_em` text,
	`criado_em` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`atualizado_em` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`comunidade_id`) REFERENCES `comunidades`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`escala_designacao_id`) REFERENCES `escala_designacoes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`usuario_id`) REFERENCES `usuarios`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `escala_respostas_unique` ON `escala_respostas` (`escala_designacao_id`,`usuario_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `escala_respostas_comunidade_idx` ON `escala_respostas` (`comunidade_id`,`confirmado_em`);
