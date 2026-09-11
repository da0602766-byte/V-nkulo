CREATE TABLE `auditoria_piloto` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`comunidade_id` integer,
	`usuario_id` integer,
	`evento` text NOT NULL,
	`resultado` text NOT NULL,
	`metadados` text DEFAULT '{}' NOT NULL,
	`criado_em` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`comunidade_id`) REFERENCES `comunidades`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`usuario_id`) REFERENCES `usuarios`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `comunidades` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`nome` text NOT NULL,
	`slug` text NOT NULL,
	`descricao_publica` text DEFAULT '' NOT NULL,
	`cidade_publica` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'ATIVA' NOT NULL,
	`ambiente_demo` integer DEFAULT true NOT NULL,
	`criado_em` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `comunidades_slug_unique` ON `comunidades` (`slug`);--> statement-breakpoint
CREATE TABLE `convites_comunidade` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`comunidade_id` integer NOT NULL,
	`email` text NOT NULL,
	`papel` text DEFAULT 'MEMBRO' NOT NULL,
	`token_hash` text NOT NULL,
	`status` text DEFAULT 'PENDENTE' NOT NULL,
	`expira_em` text NOT NULL,
	`criado_por` integer NOT NULL,
	`usado_por` integer,
	`criado_em` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`usado_em` text,
	FOREIGN KEY (`comunidade_id`) REFERENCES `comunidades`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`criado_por`) REFERENCES `usuarios`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`usado_por`) REFERENCES `usuarios`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `convites_comunidade_token_hash_unique` ON `convites_comunidade` (`token_hash`);--> statement-breakpoint
CREATE TABLE `feature_flags` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`flag_key` text NOT NULL,
	`scope_type` text DEFAULT 'GLOBAL' NOT NULL,
	`scope_id` integer DEFAULT 0 NOT NULL,
	`enabled` integer DEFAULT false NOT NULL,
	`inicia_em` text,
	`termina_em` text,
	`config_json` text DEFAULT '{}' NOT NULL,
	`alterado_por` integer,
	`alterado_em` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`alterado_por`) REFERENCES `usuarios`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `feature_flags_chave_escopo_unique` ON `feature_flags` (`flag_key`,`scope_type`,`scope_id`);--> statement-breakpoint
CREATE TABLE `politicas_editoriais_ia` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`scope_type` text DEFAULT 'GLOBAL' NOT NULL,
	`scope_id` integer DEFAULT 0 NOT NULL,
	`modo` text DEFAULT 'COM_REVISAO' NOT NULL,
	`status` text DEFAULT 'ATIVA' NOT NULL,
	`publicacao_automatica` integer DEFAULT false NOT NULL,
	`categorias_permitidas` text DEFAULT '[]' NOT NULL,
	`temas_proibidos` text DEFAULT '[]' NOT NULL,
	`criado_por` integer,
	`criado_em` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`criado_por`) REFERENCES `usuarios`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `politicas_editoriais_ia_escopo_unique` ON `politicas_editoriais_ia` (`scope_type`,`scope_id`);--> statement-breakpoint
CREATE TABLE `publicacoes_piloto` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`comunidade_id` integer NOT NULL,
	`titulo` text NOT NULL,
	`resumo` text NOT NULL,
	`status` text DEFAULT 'PUBLICADA' NOT NULL,
	`origem` text DEFAULT 'DEMO' NOT NULL,
	`criado_em` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`comunidade_id`) REFERENCES `comunidades`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `usuario_comunidades` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`usuario_id` integer NOT NULL,
	`comunidade_id` integer NOT NULL,
	`papel` text DEFAULT 'MEMBRO' NOT NULL,
	`status` text DEFAULT 'ATIVO' NOT NULL,
	`criado_em` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`usuario_id`) REFERENCES `usuarios`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`comunidade_id`) REFERENCES `comunidades`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `usuario_comunidades_usuario_comunidade_unique` ON `usuario_comunidades` (`usuario_id`,`comunidade_id`);
--> statement-breakpoint
CREATE INDEX `publicacoes_piloto_comunidade_idx` ON `publicacoes_piloto` (`comunidade_id`,`status`,`id`);
--> statement-breakpoint
CREATE INDEX `convites_comunidade_escopo_idx` ON `convites_comunidade` (`comunidade_id`,`status`,`expira_em`);
--> statement-breakpoint
INSERT OR IGNORE INTO `comunidades`
(`id`,`nome`,`slug`,`descricao_publica`,`cidade_publica`,`status`,`ambiente_demo`)
VALUES
(1,'Comunidade Piloto Norte','comunidade-piloto-norte','Uma comunidade fictícia criada exclusivamente para validar a experiência Vínkulo.','Cidade demonstrativa Norte','ATIVA',1),
(2,'Comunidade Piloto Sul','comunidade-piloto-sul','Um segundo tenant fictício para testar isolamento, perfis e navegação segura.','Cidade demonstrativa Sul','ATIVA',1);
--> statement-breakpoint
INSERT OR IGNORE INTO `usuario_comunidades`
(`usuario_id`,`comunidade_id`,`papel`,`status`)
SELECT `id`,1,
  CASE
    WHEN `perfil`='ADMIN' THEN 'ADMIN_COMUNIDADE'
    WHEN `perfil`='LIDER_CELULA' THEN 'LIDER'
    ELSE 'MEMBRO'
  END,
  'ATIVO'
FROM `usuarios`;
--> statement-breakpoint
INSERT OR IGNORE INTO `usuario_comunidades`
(`usuario_id`,`comunidade_id`,`papel`,`status`)
SELECT `id`,2,'ADMIN_COMUNIDADE','ATIVO'
FROM `usuarios`
WHERE `perfil`='ADMIN';
--> statement-breakpoint
INSERT OR IGNORE INTO `feature_flags`
(`flag_key`,`scope_type`,`scope_id`,`enabled`,`config_json`)
VALUES
('network_module_enabled','GLOBAL',0,0,'{"default":false,"requires_mfa":true}'),
('affiliate_creation_enabled','GLOBAL',0,0,'{"default":false,"requires_entitlement":true}'),
('payments_enabled','GLOBAL',0,0,'{"gateway":null}'),
('ai_editorial_enabled','GLOBAL',0,1,'{"mode":"COM_REVISAO"}'),
('ai_auto_publish_enabled','GLOBAL',0,0,'{"human_review_required":true}'),
('legacy_modules_enabled','GLOBAL',0,0,'{"reason":"tenant_migration_pending"}');
--> statement-breakpoint
INSERT OR IGNORE INTO `politicas_editoriais_ia`
(`scope_type`,`scope_id`,`modo`,`status`,`publicacao_automatica`,`categorias_permitidas`,`temas_proibidos`)
VALUES
('GLOBAL',0,'COM_REVISAO','ATIVA',0,
'["versiculos_com_referencia","dicas_da_plataforma","tutoriais","seguranca","boas_praticas","novidades_oficiais"]',
'["aconselhamento_pessoal","dados_privados","acusacoes","politica_direcionada","diagnostico","discriminacao","doutrina_controversa","propaganda_nao_autorizada"]');
--> statement-breakpoint
INSERT INTO `publicacoes_piloto`
(`comunidade_id`,`titulo`,`resumo`,`status`,`origem`)
VALUES
(1,'Bem-vindo ao ambiente Norte','Esta publicação é fictícia e pertence somente à Comunidade Piloto Norte.','PUBLICADA','DEMO'),
(2,'Bem-vindo ao ambiente Sul','Esta publicação é fictícia e pertence somente à Comunidade Piloto Sul.','PUBLICADA','DEMO');
