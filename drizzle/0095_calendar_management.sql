CREATE TABLE agenda_tarefas (
  id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  comunidade_id INTEGER NOT NULL REFERENCES comunidades(id) ON DELETE CASCADE,
  criado_por INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  responsavel_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  titulo TEXT NOT NULL,
  descricao TEXT NOT NULL DEFAULT '',
  inicia_em TEXT,
  termina_em TEXT,
  prazo_em TEXT,
  prioridade TEXT NOT NULL DEFAULT 'P2' CHECK (prioridade IN ('P1','P2','P3')),
  status TEXT NOT NULL DEFAULT 'PLANEJADO' CHECK (status IN ('PLANEJADO','EM_ANDAMENTO','BLOQUEADO','CONCLUIDO')),
  visibilidade TEXT NOT NULL DEFAULT 'PRIVADO' CHECK (visibilidade IN ('PRIVADO','COMUNIDADE')),
  motivo_bloqueio TEXT NOT NULL DEFAULT '',
  versao INTEGER NOT NULL DEFAULT 1,
  concluido_em TEXT,
  criado_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE INDEX agenda_tarefas_periodo_idx ON agenda_tarefas(comunidade_id,inicia_em);
--> statement-breakpoint
CREATE INDEX agenda_tarefas_responsavel_idx ON agenda_tarefas(comunidade_id,responsavel_id,inicia_em);
--> statement-breakpoint
ALTER TABLE agenda_compromissos ADD COLUMN versao INTEGER NOT NULL DEFAULT 1;
