-- Visita Tracking: Rastreamento de visitas presenciais
CREATE TABLE `visitor_visits` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`comunidade_id` integer NOT NULL,
	`visitante_id` integer NOT NULL,
	`data_visita` text NOT NULL,
	`local` text DEFAULT 'Igreja' NOT NULL,
	`tipo` text NOT NULL,
	`duracao_minutos` integer,
	`resultado` text,
	`proxima_visita_sugerida` text,
	`responsavel_id` integer,
	`notas` text DEFAULT '' NOT NULL,
	`criado_em` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`atualizado_em` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`comunidade_id`) REFERENCES `comunidades`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`visitante_id`) REFERENCES `visitantes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`responsavel_id`) REFERENCES `usuarios`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `visitor_visits_visitante_idx` ON `visitor_visits` (`comunidade_id`,`visitante_id`,`data_visita`);
--> statement-breakpoint
CREATE INDEX `visitor_visits_responsavel_idx` ON `visitor_visits` (`responsavel_id`,`data_visita`);
--> statement-breakpoint
CREATE INDEX `visitor_visits_data_idx` ON `visitor_visits` (`data_visita`,`comunidade_id`);
