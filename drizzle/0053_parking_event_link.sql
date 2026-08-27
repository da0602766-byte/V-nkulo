ALTER TABLE `estacionamento_reservas` ADD `evento_id` integer;
--> statement-breakpoint
ALTER TABLE `estacionamento_reservas` ADD `evento_titulo` text DEFAULT '' NOT NULL;
--> statement-breakpoint
CREATE INDEX `estacionamento_reserva_evento_idx` ON `estacionamento_reservas` (`comunidade_id`,`evento_id`,`inicio_em`);
