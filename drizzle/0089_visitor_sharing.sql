CREATE TABLE `visitante_acessos` (
	`comunidade_id` integer NOT NULL,
	`usuario_id` integer NOT NULL,
	`papel` text NOT NULL,
	PRIMARY KEY(`comunidade_id`, `usuario_id`),
	FOREIGN KEY (`comunidade_id`) REFERENCES `comunidades`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`usuario_id`) REFERENCES `usuarios`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "visitante_acessos_papel" CHECK("visitante_acessos"."papel" IN ('READ','EDIT'))
);
