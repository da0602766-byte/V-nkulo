CREATE TABLE visitante_planilha (
  comunidade_id INTEGER PRIMARY KEY REFERENCES comunidades(id) ON DELETE CASCADE,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  spreadsheet_id TEXT NOT NULL UNIQUE,
  sheet_id INTEGER NOT NULL,
  habilitada INTEGER NOT NULL DEFAULT 0,
  versao INTEGER NOT NULL DEFAULT 1,
  versao_sincronizada INTEGER NOT NULL DEFAULT 0,
  linhas INTEGER NOT NULL DEFAULT 0,
  sincronizado_em TEXT,
  ultimo_erro TEXT,
  tentar_apos INTEGER NOT NULL DEFAULT 0,
  lock_token TEXT,
  lock_ate INTEGER NOT NULL DEFAULT 0
);
CREATE TRIGGER visitante_sheet_insert AFTER INSERT ON visitantes BEGIN
  UPDATE visitante_planilha SET versao = versao + 1 WHERE comunidade_id = NEW.comunidade_id;
END;
CREATE TRIGGER visitante_sheet_update AFTER UPDATE ON visitantes BEGIN
  UPDATE visitante_planilha SET versao = versao + 1 WHERE comunidade_id IN (OLD.comunidade_id, NEW.comunidade_id);
END;
CREATE TRIGGER visitante_sheet_delete AFTER DELETE ON visitantes BEGIN
  UPDATE visitante_planilha SET versao = versao + 1 WHERE comunidade_id = OLD.comunidade_id;
END;
CREATE TRIGGER acompanhamento_sheet_insert AFTER INSERT ON acompanhamentos BEGIN
  UPDATE visitante_planilha SET versao = versao + 1 WHERE comunidade_id = NEW.comunidade_id;
END;
CREATE TRIGGER acompanhamento_sheet_update AFTER UPDATE ON acompanhamentos BEGIN
  UPDATE visitante_planilha SET versao = versao + 1 WHERE comunidade_id IN (OLD.comunidade_id, NEW.comunidade_id);
END;
CREATE TRIGGER acompanhamento_sheet_delete AFTER DELETE ON acompanhamentos BEGIN
  UPDATE visitante_planilha SET versao = versao + 1 WHERE comunidade_id = OLD.comunidade_id;
END;
CREATE TRIGGER visitante_sheet_cell AFTER UPDATE OF nome ON celulas BEGIN
  UPDATE visitante_planilha SET versao = versao + 1 WHERE comunidade_id = NEW.comunidade_id;
END;
CREATE TRIGGER visitante_sheet_category AFTER UPDATE OF nome ON visitante_categorias BEGIN
  UPDATE visitante_planilha SET versao = versao + 1 WHERE comunidade_id = NEW.comunidade_id;
END;
