CREATE TABLE `estacionamento_configuracoes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`comunidade_id` integer NOT NULL,
	`ativo` integer DEFAULT true NOT NULL,
	`nome_modulo` text DEFAULT 'Estacionamento' NOT NULL,
	`cor_destaque` text DEFAULT '#d99a32' NOT NULL,
	`regras` text DEFAULT '{}' NOT NULL,
	`campos_personalizados` text DEFAULT '[]' NOT NULL,
	`atualizado_por` integer,
	`criado_em` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`atualizado_em` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`comunidade_id`) REFERENCES `comunidades`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`atualizado_por`) REFERENCES `usuarios`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `estacionamento_config_comunidade_unique` ON `estacionamento_configuracoes` (`comunidade_id`);--> statement-breakpoint
CREATE TABLE `estacionamento_movimentacoes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`comunidade_id` integer NOT NULL,
	`vaga_id` integer,
	`evento_id` integer,
	`placa` text NOT NULL,
	`tipo_veiculo` text DEFAULT 'CARRO' NOT NULL,
	`responsavel` text NOT NULL,
	`vinculo` text DEFAULT 'VISITANTE' NOT NULL,
	`entrada_em` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`saida_em` text,
	`status` text DEFAULT 'NO_LOCAL' NOT NULL,
	`observacoes` text DEFAULT '' NOT NULL,
	`criado_por` integer,
	`atualizado_por` integer,
	`criado_em` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`atualizado_em` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`comunidade_id`) REFERENCES `comunidades`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`vaga_id`) REFERENCES `estacionamento_vagas`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`evento_id`) REFERENCES `eventos_comunidade`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`criado_por`) REFERENCES `usuarios`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`atualizado_por`) REFERENCES `usuarios`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `estacionamento_movimento_comunidade_status_idx` ON `estacionamento_movimentacoes` (`comunidade_id`,`status`,`entrada_em`);--> statement-breakpoint
CREATE INDEX `estacionamento_movimento_comunidade_placa_idx` ON `estacionamento_movimentacoes` (`comunidade_id`,`placa`,`entrada_em`);--> statement-breakpoint
CREATE TABLE `estacionamento_ocorrencias` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`comunidade_id` integer NOT NULL,
	`movimentacao_id` integer,
	`tipo` text NOT NULL,
	`descricao` text NOT NULL,
	`gravidade` text DEFAULT 'BAIXA' NOT NULL,
	`status` text DEFAULT 'ABERTA' NOT NULL,
	`criado_por` integer,
	`criado_em` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`atualizado_em` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`comunidade_id`) REFERENCES `comunidades`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`movimentacao_id`) REFERENCES `estacionamento_movimentacoes`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`criado_por`) REFERENCES `usuarios`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `estacionamento_ocorrencia_comunidade_status_idx` ON `estacionamento_ocorrencias` (`comunidade_id`,`status`,`criado_em`);--> statement-breakpoint
CREATE TABLE `estacionamento_setores` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`comunidade_id` integer NOT NULL,
	`nome` text NOT NULL,
	`cor` text DEFAULT '#3b82f6' NOT NULL,
	`ordem` integer DEFAULT 0 NOT NULL,
	`ativo` integer DEFAULT true NOT NULL,
	`criado_em` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`comunidade_id`) REFERENCES `comunidades`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `estacionamento_setor_nome_unique` ON `estacionamento_setores` (`comunidade_id`,`nome`);--> statement-breakpoint
CREATE INDEX `estacionamento_setor_comunidade_idx` ON `estacionamento_setores` (`comunidade_id`,`ativo`,`ordem`);--> statement-breakpoint
CREATE TABLE `estacionamento_vagas` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`comunidade_id` integer NOT NULL,
	`setor_id` integer NOT NULL,
	`codigo` text NOT NULL,
	`tipo` text DEFAULT 'COMUM' NOT NULL,
	`status` text DEFAULT 'LIVRE' NOT NULL,
	`ativo` integer DEFAULT true NOT NULL,
	`criado_em` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`atualizado_em` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`comunidade_id`) REFERENCES `comunidades`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`setor_id`) REFERENCES `estacionamento_setores`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `estacionamento_vaga_codigo_unique` ON `estacionamento_vagas` (`comunidade_id`,`codigo`);--> statement-breakpoint
CREATE INDEX `estacionamento_vaga_comunidade_status_idx` ON `estacionamento_vagas` (`comunidade_id`,`status`,`tipo`);--> statement-breakpoint
INSERT INTO estacionamento_configuracoes
  (comunidade_id, ativo, nome_modulo, cor_destaque)
SELECT id, 1, 'Estacionamento', '#d99a32'
FROM comunidades
WHERE ambiente_demo = 1;--> statement-breakpoint
INSERT INTO estacionamento_setores (comunidade_id, nome, cor, ordem)
SELECT id, 'Setor A', '#62a7ff', 1 FROM comunidades WHERE ambiente_demo = 1
UNION ALL
SELECT id, 'Setor B', '#4fd1a5', 2 FROM comunidades WHERE ambiente_demo = 1
UNION ALL
SELECT id, 'Visitantes', '#9d7bf3', 3 FROM comunidades WHERE ambiente_demo = 1
UNION ALL
SELECT id, 'Acessibilidade', '#e0a542', 4 FROM comunidades WHERE ambiente_demo = 1;--> statement-breakpoint
WITH RECURSIVE numeros(n) AS (
  VALUES(1)
  UNION ALL
  SELECT n + 1 FROM numeros WHERE n < 8
)
INSERT INTO estacionamento_vagas
  (comunidade_id, setor_id, codigo, tipo, status)
SELECT
  s.comunidade_id,
  s.id,
  char(64 + s.ordem) || printf('%02d', numeros.n),
  CASE
    WHEN s.nome = 'Acessibilidade' AND numeros.n <= 4 THEN 'PCD'
    WHEN s.nome = 'Acessibilidade' THEN 'IDOSO'
    WHEN s.nome = 'Visitantes' AND numeros.n <= 2 THEN 'RESERVADA'
    ELSE 'COMUM'
  END,
  'LIVRE'
FROM estacionamento_setores s
CROSS JOIN numeros;--> statement-breakpoint
INSERT INTO estacionamento_movimentacoes
  (comunidade_id, vaga_id, placa, tipo_veiculo, responsavel, vinculo, observacoes)
SELECT c.id, v.id, 'DEMO01', 'CARRO', 'Visitante demonstrativo', 'VISITANTE',
  'Registro fictício do ambiente piloto'
FROM comunidades c
JOIN estacionamento_vagas v
  ON v.comunidade_id = c.id AND v.codigo = 'C03'
WHERE c.slug = 'comunidade-piloto-norte';--> statement-breakpoint
UPDATE estacionamento_vagas
SET status = 'OCUPADA', atualizado_em = CURRENT_TIMESTAMP
WHERE id = (
  SELECT vaga_id FROM estacionamento_movimentacoes
  WHERE placa = 'DEMO01' AND status = 'NO_LOCAL' LIMIT 1
);
