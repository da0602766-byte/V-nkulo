CREATE TABLE IF NOT EXISTS supabase_storage_copies (
  object_key TEXT PRIMARY KEY,
  project_ref TEXT NOT NULL,
  bucket TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  copied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS supabase_storage_copies_project_idx
  ON supabase_storage_copies(project_ref, bucket);
