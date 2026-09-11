CREATE TABLE `aviso_comentarios` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`aviso_id` integer NOT NULL,
	`usuario_id` integer NOT NULL,
	`texto` text NOT NULL,
	`criado_em` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`aviso_id`) REFERENCES `avisos`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`usuario_id`) REFERENCES `usuarios`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `aviso_reacoes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`aviso_id` integer NOT NULL,
	`usuario_id` integer NOT NULL,
	`emoji` text NOT NULL,
	`criado_em` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`aviso_id`) REFERENCES `avisos`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`usuario_id`) REFERENCES `usuarios`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `aviso_reacoes_aviso_usuario_emoji_unique` ON `aviso_reacoes` (`aviso_id`,`usuario_id`,`emoji`);--> statement-breakpoint
CREATE TABLE `blocos_texto` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`area` text NOT NULL,
	`posicao` text DEFAULT 'TOPO' NOT NULL,
	`titulo` text,
	`conteudo` text NOT NULL,
	`cor` text DEFAULT '#eef7f6' NOT NULL,
	`ordem` integer DEFAULT 0 NOT NULL,
	`ativo` integer DEFAULT true NOT NULL,
	`criado_por` text NOT NULL,
	`criado_em` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`atualizado_em` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `teens_acompanhamentos` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`usuario_id` integer NOT NULL,
	`responsavel_email` text NOT NULL,
	`resultado` text NOT NULL,
	`descricao` text,
	`proximo_contato` text,
	`criado_em` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`usuario_id`) REFERENCES `usuarios`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `avisos` ADD `aniversario_usuario_id` integer REFERENCES usuarios(id);--> statement-breakpoint
ALTER TABLE `avisos` ADD `aniversario_ano` integer;--> statement-breakpoint
CREATE UNIQUE INDEX `avisos_aniversario_usuario_ano_unique` ON `avisos` (`aniversario_usuario_id`,`aniversario_ano`);--> statement-breakpoint
ALTER TABLE `usuarios` ADD `nome_pais` text;--> statement-breakpoint
ALTER TABLE `usuarios` ADD `diaconia_equipe_id` integer;--> statement-breakpoint
ALTER TABLE `visitantes` ADD `celula_id` integer REFERENCES celulas(id);
--> statement-breakpoint
UPDATE `visitantes`
SET `celula_id` = (SELECT `id` FROM `celulas` WHERE lower(`celulas`.`nome`) = lower(`visitantes`.`celula`) LIMIT 1)
WHERE `celula` IS NOT NULL AND trim(`celula`) <> '';
