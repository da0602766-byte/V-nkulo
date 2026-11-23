ALTER TABLE celula_relatorios ADD COLUMN versao INTEGER NOT NULL DEFAULT 1;
--> statement-breakpoint
ALTER TABLE celula_relatorios ADD COLUMN atualizado_em TEXT;
--> statement-breakpoint
CREATE TABLE celula_relatorio_revisoes (
  relatorio_id INTEGER NOT NULL REFERENCES celula_relatorios(id) ON DELETE CASCADE,
  versao INTEGER NOT NULL,
  aconteceu INTEGER NOT NULL,
  presentes INTEGER NOT NULL,
  visitantes INTEGER NOT NULL,
  observacoes TEXT NOT NULL,
  registrado_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  registrado_em TEXT NOT NULL,
  PRIMARY KEY (relatorio_id, versao)
);
--> statement-breakpoint
CREATE TRIGGER celula_relatorio_guardar_revisao BEFORE UPDATE OF versao ON celula_relatorios
WHEN NEW.versao > OLD.versao
BEGIN
  INSERT INTO celula_relatorio_revisoes (relatorio_id,versao,aconteceu,presentes,visitantes,observacoes,registrado_por,registrado_em)
  VALUES (OLD.id,OLD.versao,OLD.aconteceu,OLD.presentes,OLD.visitantes,OLD.observacoes,OLD.enviado_por_usuario_id,COALESCE(OLD.atualizado_em,OLD.criado_em));
END;
