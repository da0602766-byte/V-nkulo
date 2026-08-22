-- Arquivamento reversível dos registros demonstrativos.
-- Nenhuma linha é excluída: histórico, relacionamentos e evidências permanecem.
UPDATE `publicacoes_piloto`
SET `status` = 'ARQUIVADA', `atualizado_em` = CURRENT_TIMESTAMP
WHERE `origem` = 'DEMO';
--> statement-breakpoint
UPDATE `rascunhos_editoriais_ia`
SET `status` = 'ARQUIVADO',
  `motivo_bloqueio` = 'Registro demonstrativo arquivado na reforma oficial.',
  `atualizado_em` = CURRENT_TIMESTAMP
WHERE `hash_semantico` LIKE 'demo-%'
   OR `politica_aplicada` LIKE '%"demo":true%';
--> statement-breakpoint
UPDATE `estacionamento_movimentacoes`
SET `status` = 'ARQUIVADA',
  `observacoes` = trim(`observacoes` || ' · Arquivada na reforma oficial.'),
  `atualizado_em` = CURRENT_TIMESTAMP
WHERE `placa` = 'DEMO01'
   OR `observacoes` LIKE '%demonstrativ%'
   OR `responsavel` LIKE '%demonstrativ%';
--> statement-breakpoint
UPDATE `estacionamento_vagas`
SET `status` = 'LIVRE', `atualizado_em` = CURRENT_TIMESTAMP
WHERE `id` IN (
  SELECT `vaga_id` FROM `estacionamento_movimentacoes`
  WHERE `status` = 'ARQUIVADA' AND `vaga_id` IS NOT NULL
);
--> statement-breakpoint
UPDATE `estacionamento_configuracoes`
SET `ativo` = 0, `atualizado_em` = CURRENT_TIMESTAMP
WHERE `comunidade_id` IN (
  SELECT `id` FROM `comunidades` WHERE `ambiente_demo` = 1
);
--> statement-breakpoint
INSERT INTO `auditoria_piloto`
(`comunidade_id`, `usuario_id`, `evento`, `resultado`, `metadados`)
SELECT `id`, NULL, 'AMBIENTE_DEMONSTRATIVO_ARQUIVADO', 'SUCESSO',
  '{"modo":"ARQUIVAMENTO_REVERSIVEL","exclusao":false,"motivo":"Reforma oficial do VINKULO"}'
FROM `comunidades`
WHERE `ambiente_demo` = 1 AND `status` <> 'ARQUIVADA';
--> statement-breakpoint
UPDATE `comunidades`
SET `status` = 'ARQUIVADA', `feed_publico_habilitado` = 0
WHERE `ambiente_demo` = 1;
