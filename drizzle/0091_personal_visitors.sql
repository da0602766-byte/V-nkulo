CREATE TABLE `visitante_pessoal_storage` (
	`usuario_id` integer NOT NULL,
	`comunidade_id` integer NOT NULL,
	`provider` text NOT NULL,
	`revisao` integer DEFAULT 0 NOT NULL,
	`pasta_id` text,
	`arquivo_id` text,
	`hash` text,
	PRIMARY KEY(`usuario_id`, `comunidade_id`),
	FOREIGN KEY (`usuario_id`) REFERENCES `usuarios`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`comunidade_id`) REFERENCES `comunidades`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "visitor_personal_provider" CHECK("visitante_pessoal_storage"."provider" IN ('LOCAL','GOOGLE_DRIVE'))
);
