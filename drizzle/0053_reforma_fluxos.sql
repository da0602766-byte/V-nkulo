ALTER TABLE `eventos_comunidade` ADD `escalas_abrem_em` text;
--> statement-breakpoint
ALTER TABLE `eventos_comunidade` ADD `reservas_abrem_em` text;
--> statement-breakpoint
ALTER TABLE `escalas_ministerio` ADD `publicar_em` text;
--> statement-breakpoint
CREATE INDEX `escalas_ministerio_publicacao_idx`
ON `escalas_ministerio` (`comunidade_id`, `status`, `publicar_em`);
