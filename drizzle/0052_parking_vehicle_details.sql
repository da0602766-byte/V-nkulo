ALTER TABLE `estacionamento_reservas` ADD `placa_veiculo` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `estacionamento_reservas` ADD `tipo_veiculo` text DEFAULT 'CARRO' NOT NULL;
--> statement-breakpoint
ALTER TABLE `estacionamento_reservas` ADD `modelo_veiculo` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `estacionamento_reservas` ADD `cor_veiculo` text DEFAULT '' NOT NULL;
