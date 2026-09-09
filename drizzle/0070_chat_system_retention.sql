-- Mensagens privadas deixam de ser espelhadas no Google Drive: o conteúdo
-- passa a viver só em `mensagens_privadas`, no banco do sistema, e a rotina
-- de manutenção em app/lib/chat-retention.ts apaga toda conversa de uma
-- semana encerrada, sem exceção (ver aviso fixo na própria aba Mensagens).
-- O ciclo de agrupamento vira semanal (`ciclo_semana`) no lugar do mensal
-- (`ciclo_mes`), e as colunas que só existiam para apontar o arquivo/pasta
-- no Drive da conversa saem da tabela.
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_conversas_privadas` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`comunidade_id` integer NOT NULL,
	`usuario_menor_id` integer NOT NULL,
	`usuario_maior_id` integer NOT NULL,
	`ciclo_semana` text NOT NULL,
	`atualizado_em` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`criado_em` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`comunidade_id`) REFERENCES `comunidades`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`usuario_menor_id`) REFERENCES `usuarios`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`usuario_maior_id`) REFERENCES `usuarios`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_conversas_privadas` ("id", "comunidade_id", "usuario_menor_id", "usuario_maior_id", "ciclo_semana", "atualizado_em", "criado_em")
  SELECT "id", "comunidade_id", "usuario_menor_id", "usuario_maior_id", "ciclo_mes", "atualizado_em", "criado_em" FROM `conversas_privadas`;
--> statement-breakpoint
DROP TABLE `conversas_privadas`;--> statement-breakpoint
ALTER TABLE `__new_conversas_privadas` RENAME TO `conversas_privadas`;--> statement-breakpoint
CREATE UNIQUE INDEX `conversas_privadas_par_ciclo_unique` ON `conversas_privadas` (`comunidade_id`,`usuario_menor_id`,`usuario_maior_id`,`ciclo_semana`);--> statement-breakpoint
CREATE INDEX `conversas_privadas_usuario_menor_idx` ON `conversas_privadas` (`comunidade_id`,`usuario_menor_id`,`atualizado_em`);--> statement-breakpoint
CREATE INDEX `conversas_privadas_usuario_maior_idx` ON `conversas_privadas` (`comunidade_id`,`usuario_maior_id`,`atualizado_em`);--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
ALTER TABLE `mensagens_privadas` ADD `entregue_em` text;
