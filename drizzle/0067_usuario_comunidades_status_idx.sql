-- Auditoria de desempenho: usuario_comunidades só tinha índice único
-- (usuario_id, comunidade_id). Toda consulta de isolamento por comunidade
-- (listas de pessoas, resolução de tenant/permissões) filtra por
-- comunidade_id primeiro, e esse índice não serve de entrada para esse
-- filtro. Índice puramente aditivo, sem alterar dados existentes.
CREATE INDEX IF NOT EXISTS `usuario_comunidades_comunidade_status_idx` ON `usuario_comunidades` (`comunidade_id`,`status`);
