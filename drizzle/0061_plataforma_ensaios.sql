-- Ambiente de ensaio do proprietário.
--
-- Uma publicação de plataforma pode atingir todas as comunidades de uma vez,
-- e hoje não há como desfazer. Esta tabela guarda o rascunho, o alvo e — no
-- momento da publicação — o valor que existia antes em cada comunidade, que é
-- o que torna a reversão possível. Sem o retrato do "antes", reverter seria
-- adivinhação.
CREATE TABLE `plataforma_ensaios` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`assunto` text NOT NULL,
	`titulo` text NOT NULL,
	`valor_json` text NOT NULL,
	`estado` text DEFAULT 'RASCUNHO' NOT NULL,
	`alvo_tipo` text DEFAULT 'TODAS' NOT NULL,
	`alvo_json` text DEFAULT '[]' NOT NULL,
	`anterior_json` text DEFAULT '{}' NOT NULL,
	`observacao` text DEFAULT '' NOT NULL,
	`criado_por_usuario_id` integer NOT NULL,
	`criado_em` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`publicado_por_usuario_id` integer,
	`publicado_em` text,
	`revertido_em` text,
	`comunidades_afetadas` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`criado_por_usuario_id`) REFERENCES `usuarios`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`publicado_por_usuario_id`) REFERENCES `usuarios`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `plataforma_ensaios_estado_idx` ON `plataforma_ensaios` (`estado`,`id`);
--> statement-breakpoint
CREATE INDEX `plataforma_ensaios_assunto_idx` ON `plataforma_ensaios` (`assunto`,`estado`,`id`);
