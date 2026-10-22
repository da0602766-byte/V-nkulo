CREATE TABLE `visitante_drive` (
	`comunidade_id` integer PRIMARY KEY NOT NULL,
	`usuario_id` integer NOT NULL,
	`estado` text NOT NULL,
	`pasta_id` text,
	`arquivo_id` text,
	`hash` text,
	`revisao` integer DEFAULT 0 NOT NULL,
	`verificado_em` text,
	FOREIGN KEY (`comunidade_id`) REFERENCES `comunidades`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`usuario_id`) REFERENCES `usuarios`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "visitante_drive_estado" CHECK("visitante_drive"."estado" IN ('LOCKED','REVIEW','PURGING','ACTIVE')),
	CONSTRAINT "visitante_drive_revisao" CHECK("visitante_drive"."revisao" >= 0)
);
--> statement-breakpoint
CREATE TABLE `visitante_drive_acessos` (
	`comunidade_id` integer NOT NULL,
	`usuario_id` integer NOT NULL,
	`papel` text NOT NULL,
	PRIMARY KEY(`comunidade_id`, `usuario_id`),
	FOREIGN KEY (`comunidade_id`) REFERENCES `visitante_drive`(`comunidade_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`usuario_id`) REFERENCES `usuarios`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "visitante_drive_papel" CHECK("visitante_drive_acessos"."papel" IN ('READ','EDIT'))
);

--> statement-breakpoint
CREATE TRIGGER drive_guard_visitantes_insert BEFORE INSERT ON visitantes
 WHEN EXISTS(SELECT 1 FROM visitante_drive WHERE comunidade_id=NEW.comunidade_id)
 BEGIN SELECT RAISE(ABORT,'VISITOR_DRIVE_REQUIRED'); END;
--> statement-breakpoint
CREATE TRIGGER drive_guard_visitantes_update BEFORE UPDATE ON visitantes
 WHEN EXISTS(SELECT 1 FROM visitante_drive WHERE comunidade_id IN (NEW.comunidade_id,OLD.comunidade_id))
 BEGIN SELECT RAISE(ABORT,'VISITOR_DRIVE_REQUIRED'); END;
--> statement-breakpoint
CREATE TRIGGER drive_guard_visitantes_delete BEFORE DELETE ON visitantes
 WHEN EXISTS(SELECT 1 FROM visitante_drive WHERE comunidade_id=OLD.comunidade_id AND estado <> 'PURGING')
 BEGIN SELECT RAISE(ABORT,'VISITOR_DRIVE_REQUIRED'); END;
--> statement-breakpoint
CREATE TRIGGER drive_guard_acompanhamentos_insert BEFORE INSERT ON acompanhamentos
 WHEN EXISTS(SELECT 1 FROM visitante_drive WHERE comunidade_id=NEW.comunidade_id)
 BEGIN SELECT RAISE(ABORT,'VISITOR_DRIVE_REQUIRED'); END;
--> statement-breakpoint
CREATE TRIGGER drive_guard_acompanhamentos_update BEFORE UPDATE ON acompanhamentos
 WHEN EXISTS(SELECT 1 FROM visitante_drive WHERE comunidade_id IN (NEW.comunidade_id,OLD.comunidade_id))
 BEGIN SELECT RAISE(ABORT,'VISITOR_DRIVE_REQUIRED'); END;
--> statement-breakpoint
CREATE TRIGGER drive_guard_acompanhamentos_delete BEFORE DELETE ON acompanhamentos
 WHEN EXISTS(SELECT 1 FROM visitante_drive WHERE comunidade_id=OLD.comunidade_id AND estado <> 'PURGING')
 BEGIN SELECT RAISE(ABORT,'VISITOR_DRIVE_REQUIRED'); END;
--> statement-breakpoint
CREATE TRIGGER drive_guard_visitor_contacts_insert BEFORE INSERT ON visitor_contacts
 WHEN EXISTS(SELECT 1 FROM visitante_drive WHERE comunidade_id=NEW.comunidade_id)
 BEGIN SELECT RAISE(ABORT,'VISITOR_DRIVE_REQUIRED'); END;
--> statement-breakpoint
CREATE TRIGGER drive_guard_visitor_contacts_update BEFORE UPDATE ON visitor_contacts
 WHEN EXISTS(SELECT 1 FROM visitante_drive WHERE comunidade_id IN (NEW.comunidade_id,OLD.comunidade_id))
 BEGIN SELECT RAISE(ABORT,'VISITOR_DRIVE_REQUIRED'); END;
--> statement-breakpoint
CREATE TRIGGER drive_guard_visitor_contacts_delete BEFORE DELETE ON visitor_contacts
 WHEN EXISTS(SELECT 1 FROM visitante_drive WHERE comunidade_id=OLD.comunidade_id AND estado <> 'PURGING')
 BEGIN SELECT RAISE(ABORT,'VISITOR_DRIVE_REQUIRED'); END;
--> statement-breakpoint
CREATE TRIGGER drive_guard_visitor_visits_insert BEFORE INSERT ON visitor_visits
 WHEN EXISTS(SELECT 1 FROM visitante_drive WHERE comunidade_id=NEW.comunidade_id)
 BEGIN SELECT RAISE(ABORT,'VISITOR_DRIVE_REQUIRED'); END;
--> statement-breakpoint
CREATE TRIGGER drive_guard_visitor_visits_update BEFORE UPDATE ON visitor_visits
 WHEN EXISTS(SELECT 1 FROM visitante_drive WHERE comunidade_id IN (NEW.comunidade_id,OLD.comunidade_id))
 BEGIN SELECT RAISE(ABORT,'VISITOR_DRIVE_REQUIRED'); END;
--> statement-breakpoint
CREATE TRIGGER drive_guard_visitor_visits_delete BEFORE DELETE ON visitor_visits
 WHEN EXISTS(SELECT 1 FROM visitante_drive WHERE comunidade_id=OLD.comunidade_id AND estado <> 'PURGING')
 BEGIN SELECT RAISE(ABORT,'VISITOR_DRIVE_REQUIRED'); END;
--> statement-breakpoint
CREATE TRIGGER drive_guard_visitante_categorias_insert BEFORE INSERT ON visitante_categorias
 WHEN EXISTS(SELECT 1 FROM visitante_drive WHERE comunidade_id=NEW.comunidade_id)
 BEGIN SELECT RAISE(ABORT,'VISITOR_DRIVE_REQUIRED'); END;
--> statement-breakpoint
CREATE TRIGGER drive_guard_visitante_categorias_update BEFORE UPDATE ON visitante_categorias
 WHEN EXISTS(SELECT 1 FROM visitante_drive WHERE comunidade_id IN (NEW.comunidade_id,OLD.comunidade_id))
 BEGIN SELECT RAISE(ABORT,'VISITOR_DRIVE_REQUIRED'); END;
--> statement-breakpoint
CREATE TRIGGER drive_guard_visitante_categorias_delete BEFORE DELETE ON visitante_categorias
 WHEN EXISTS(SELECT 1 FROM visitante_drive WHERE comunidade_id=OLD.comunidade_id AND estado <> 'PURGING')
 BEGIN SELECT RAISE(ABORT,'VISITOR_DRIVE_REQUIRED'); END;
--> statement-breakpoint
CREATE TRIGGER drive_guard_visitante_campos_insert BEFORE INSERT ON visitante_campos
 WHEN EXISTS(SELECT 1 FROM visitante_drive WHERE comunidade_id=NEW.comunidade_id)
 BEGIN SELECT RAISE(ABORT,'VISITOR_DRIVE_REQUIRED'); END;
--> statement-breakpoint
CREATE TRIGGER drive_guard_visitante_campos_update BEFORE UPDATE ON visitante_campos
 WHEN EXISTS(SELECT 1 FROM visitante_drive WHERE comunidade_id IN (NEW.comunidade_id,OLD.comunidade_id))
 BEGIN SELECT RAISE(ABORT,'VISITOR_DRIVE_REQUIRED'); END;
--> statement-breakpoint
CREATE TRIGGER drive_guard_visitante_campos_delete BEFORE DELETE ON visitante_campos
 WHEN EXISTS(SELECT 1 FROM visitante_drive WHERE comunidade_id=OLD.comunidade_id AND estado <> 'PURGING')
 BEGIN SELECT RAISE(ABORT,'VISITOR_DRIVE_REQUIRED'); END;
--> statement-breakpoint
CREATE TRIGGER drive_guard_layouts_interface_insert BEFORE INSERT ON layouts_interface
 WHEN EXISTS(SELECT 1 FROM visitante_drive WHERE comunidade_id=NEW.comunidade_id) AND NEW.escopo LIKE 'care-notes:user:%'
 BEGIN SELECT RAISE(ABORT,'VISITOR_DRIVE_REQUIRED'); END;
--> statement-breakpoint
CREATE TRIGGER drive_guard_layouts_interface_update BEFORE UPDATE ON layouts_interface
 WHEN (EXISTS(SELECT 1 FROM visitante_drive WHERE comunidade_id=NEW.comunidade_id) AND NEW.escopo LIKE 'care-notes:user:%') OR (EXISTS(SELECT 1 FROM visitante_drive WHERE comunidade_id=OLD.comunidade_id) AND OLD.escopo LIKE 'care-notes:user:%')
 BEGIN SELECT RAISE(ABORT,'VISITOR_DRIVE_REQUIRED'); END;
--> statement-breakpoint
CREATE TRIGGER drive_guard_layouts_interface_delete BEFORE DELETE ON layouts_interface
 WHEN EXISTS(SELECT 1 FROM visitante_drive WHERE comunidade_id=OLD.comunidade_id AND estado <> 'PURGING') AND OLD.escopo LIKE 'care-notes:user:%'
 BEGIN SELECT RAISE(ABORT,'VISITOR_DRIVE_REQUIRED'); END;

