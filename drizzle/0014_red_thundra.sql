DROP INDEX `celulas_nome_unique`;--> statement-breakpoint
ALTER TABLE `celulas` ADD `comunidade_id` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `celulas` ADD `ativo` integer DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `celulas` ADD `escopo_confirmado` integer DEFAULT true NOT NULL;--> statement-breakpoint
UPDATE `celulas` SET `escopo_confirmado` = 0;--> statement-breakpoint
CREATE UNIQUE INDEX `celulas_comunidade_nome_unique` ON `celulas` (`comunidade_id`,`nome`);--> statement-breakpoint
CREATE INDEX `celulas_comunidade_ativo_idx` ON `celulas` (`comunidade_id`,`ativo`,`escopo_confirmado`,`nome`);--> statement-breakpoint
ALTER TABLE `acompanhamentos` ADD `comunidade_id` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `acompanhamentos` ADD `escopo_confirmado` integer DEFAULT true NOT NULL;--> statement-breakpoint
UPDATE `acompanhamentos` SET `escopo_confirmado` = 0;--> statement-breakpoint
CREATE INDEX `acompanhamentos_comunidade_visitante_idx` ON `acompanhamentos` (`comunidade_id`,`visitante_id`,`id`);--> statement-breakpoint
ALTER TABLE `visitantes` ADD `comunidade_id` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `visitantes` ADD `escopo_confirmado` integer DEFAULT true NOT NULL;--> statement-breakpoint
UPDATE `visitantes` SET `escopo_confirmado` = 0;--> statement-breakpoint
CREATE INDEX `visitantes_comunidade_ativo_idx` ON `visitantes` (`comunidade_id`,`ativo`,`escopo_confirmado`,`id`);--> statement-breakpoint
CREATE INDEX `visitantes_comunidade_status_idx` ON `visitantes` (`comunidade_id`,`status`);
