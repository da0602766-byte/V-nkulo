CREATE TABLE `rascunhos_editoriais_ia` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`comunidade_id` integer NOT NULL,
	`titulo` text NOT NULL,
	`conteudo` text NOT NULL,
	`categoria` text NOT NULL,
	`referencia` text DEFAULT '' NOT NULL,
	`origem` text DEFAULT 'IA' NOT NULL,
	`status` text DEFAULT 'AGUARDANDO_REVISAO' NOT NULL,
	`politica_aplicada` text NOT NULL,
	`versao` integer DEFAULT 1 NOT NULL,
	`motivo_bloqueio` text DEFAULT '' NOT NULL,
	`hash_semantico` text NOT NULL,
	`conteudo_semelhante_id` integer,
	`revisado_por` integer,
	`revisado_em` text,
	`criado_em` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`atualizado_em` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`comunidade_id`) REFERENCES `comunidades`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`revisado_por`) REFERENCES `usuarios`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `rascunhos_editoriais_status_idx` ON `rascunhos_editoriais_ia` (`status`,`criado_em`,`id`);--> statement-breakpoint
CREATE INDEX `rascunhos_editoriais_comunidade_idx` ON `rascunhos_editoriais_ia` (`comunidade_id`,`criado_em`,`id`);--> statement-breakpoint
ALTER TABLE `politicas_editoriais_ia` ADD `frequencia` text DEFAULT 'SEMANAL' NOT NULL;--> statement-breakpoint
ALTER TABLE `politicas_editoriais_ia` ADD `horarios` text DEFAULT '["09:00"]' NOT NULL;--> statement-breakpoint
ALTER TABLE `politicas_editoriais_ia` ADD `comunidades_destino` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `politicas_editoriais_ia` ADD `quantidade_diaria` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `politicas_editoriais_ia` ADD `tamanho_maximo` integer DEFAULT 1200 NOT NULL;--> statement-breakpoint
ALTER TABLE `politicas_editoriais_ia` ADD `usar_imagens` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `politicas_editoriais_ia` ADD `fontes_permitidas` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `politicas_editoriais_ia` ADD `atualizado_por` integer REFERENCES usuarios(id);--> statement-breakpoint
ALTER TABLE `politicas_editoriais_ia` ADD `atualizado_em` text DEFAULT '1970-01-01T00:00:00.000Z' NOT NULL;--> statement-breakpoint
UPDATE `politicas_editoriais_ia`
SET
  `frequencia` = 'SEMANAL',
  `horarios` = '["09:00"]',
  `comunidades_destino` = '[1,2]',
  `quantidade_diaria` = 1,
  `tamanho_maximo` = 1200,
  `usar_imagens` = 0,
  `fontes_permitidas` = '["Central de ajuda Vínkulo","Documentação oficial da plataforma"]',
  `atualizado_em` = CURRENT_TIMESTAMP
WHERE `scope_type` = 'GLOBAL' AND `scope_id` = 0;--> statement-breakpoint
INSERT INTO `rascunhos_editoriais_ia`
(`comunidade_id`,`titulo`,`conteudo`,`categoria`,`referencia`,`origem`,`status`,
 `politica_aplicada`,`versao`,`motivo_bloqueio`,`hash_semantico`)
VALUES
(1,
 'Como acompanhar os próximos eventos',
 'A agenda da comunidade reúne os eventos publicados e permite conferir data, horário e local antes de confirmar a participação.',
 'TUTORIAIS',
 'Central de ajuda Vínkulo',
 'IA',
 'AGUARDANDO_REVISAO',
 '{"mode":"COM_REVISAO","automatic_publish":false,"demo":true}',
 1,
 '',
 'demo-tutorial-agenda-v1');
