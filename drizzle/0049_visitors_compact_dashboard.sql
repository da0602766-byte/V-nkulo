ALTER TABLE `visitantes` ADD `parente` text;
--> statement-breakpoint
ALTER TABLE `visitante_categorias` ADD `exibir_dashboard` integer DEFAULT true NOT NULL;
--> statement-breakpoint
CREATE INDEX `visitantes_comunidade_nascimento_idx` ON `visitantes` (`comunidade_id`,`ativo`,`data_nascimento`);
