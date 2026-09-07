-- Auditoria de desempenho: consultas de isolamento por comunidade filtram
-- primeiro por comunidade_id e status; o índice único existente começa por
-- usuario_id e não atende eficientemente esse acesso.
CREATE INDEX IF NOT EXISTS `usuario_comunidades_comunidade_status_idx` ON `usuario_comunidades` (`comunidade_id`,`status`);
