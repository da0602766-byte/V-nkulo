ALTER TABLE `visitante_categorias` ADD `idade_minima` integer;--> statement-breakpoint
ALTER TABLE `visitante_categorias` ADD `idade_maxima` integer;--> statement-breakpoint
ALTER TABLE `visitante_categorias` ADD `migracao_automatica` integer DEFAULT false NOT NULL;