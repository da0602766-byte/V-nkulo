CREATE TABLE IF NOT EXISTS mobile_module_grants (
 usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
 comunidade_id INTEGER NOT NULL REFERENCES comunidades(id) ON DELETE CASCADE,
 device_id TEXT NOT NULL, module TEXT NOT NULL, session_hash TEXT NOT NULL,
 token_hash TEXT NOT NULL, expires_at INTEGER NOT NULL,
 PRIMARY KEY(usuario_id,comunidade_id,device_id,module));
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS mobile_module_receipts (
 usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
 comunidade_id INTEGER NOT NULL REFERENCES comunidades(id) ON DELETE CASCADE,
 operation_id TEXT NOT NULL, module TEXT NOT NULL, payload_hash TEXT NOT NULL,
 result TEXT NOT NULL CHECK(result IN ('PENDING','CONFIRMED','CONFLICT')),
 result_id TEXT, processed INTEGER NOT NULL DEFAULT 0,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(usuario_id,comunidade_id,operation_id));
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS mobile_checklist_versions (
 item_id INTEGER PRIMARY KEY REFERENCES ministerio_checklist_itens(id) ON DELETE CASCADE,
 version INTEGER NOT NULL DEFAULT 0);
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS mobile_checklist_updated AFTER UPDATE ON ministerio_checklist_itens
 BEGIN INSERT INTO mobile_checklist_versions(item_id,version) VALUES(NEW.id,1)
 ON CONFLICT(item_id) DO UPDATE SET version=version+1; END;
