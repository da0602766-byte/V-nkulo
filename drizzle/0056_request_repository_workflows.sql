ALTER TABLE `solicitacao_repositorio_itens` ADD `responsavel_usuario_id` integer REFERENCES `usuarios`(`id`) ON DELETE set null;
--> statement-breakpoint
ALTER TABLE `solicitacao_repositorio_itens` ADD `mensagem_atendimento` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `solicitacao_repositorio_itens` ADD `testemunho` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `solicitacao_repositorio_itens` ADD `testemunho_compartilhavel` integer DEFAULT -1 NOT NULL;
--> statement-breakpoint
ALTER TABLE `solicitacao_repositorio_itens` ADD `testemunho_publicado_em` text;
--> statement-breakpoint
ALTER TABLE `solicitacao_repositorio_itens` ADD `finalizado_em` text;
--> statement-breakpoint
CREATE INDEX `solicitacao_repositorio_itens_finalizado_idx` ON `solicitacao_repositorio_itens` (`comunidade_id`,`finalizado_em`);
