CREATE TABLE relatorios_agendamentos (
  comunidade_id INTEGER NOT NULL REFERENCES comunidades(id) ON DELETE CASCADE,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  frequencia TEXT NOT NULL CHECK(frequencia IN ('SEMANAL','MENSAL')),
  dias INTEGER NOT NULL CHECK(dias BETWEEN 1 AND 366),
  area TEXT NOT NULL DEFAULT '',
  grupo TEXT NOT NULL DEFAULT '',
  situacao TEXT NOT NULL DEFAULT '',
  proxima_execucao TEXT NOT NULL,
  versao INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY(comunidade_id,usuario_id)
);
--> statement-breakpoint
CREATE INDEX relatorios_agendamentos_proxima_idx ON relatorios_agendamentos(proxima_execucao);
