-- No cleanup runs in this migration. Every reset requires an authenticated owner action.
CREATE TABLE platform_reset_control (
 id INTEGER PRIMARY KEY CHECK(id=1),
 challenge_hash TEXT,
 owner_id INTEGER,
 expires_at INTEGER NOT NULL DEFAULT 0,
 summary TEXT,
 generation INTEGER NOT NULL DEFAULT 0
);
--> statement-breakpoint
INSERT INTO platform_reset_control(id) VALUES(1);
--> statement-breakpoint
CREATE TABLE platform_reset_guard (ok INTEGER NOT NULL CHECK(ok=1));
--> statement-breakpoint
CREATE TABLE platform_reset_history (
 id TEXT PRIMARY KEY,
 mode TEXT NOT NULL CHECK(mode IN ('ARCHIVE','DELETE')),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 owner_id INTEGER NOT NULL,
 summary TEXT NOT NULL,
 archive_iv TEXT,
 archive_bytes INTEGER NOT NULL DEFAULT 0
);
--> statement-breakpoint
CREATE TABLE platform_reset_chunks (
 reset_id TEXT NOT NULL REFERENCES platform_reset_history(id) ON DELETE CASCADE,
 part INTEGER NOT NULL,
 ciphertext TEXT NOT NULL,
 PRIMARY KEY(reset_id,part)
);
--> statement-breakpoint
CREATE TABLE platform_reset_files (
 object_key TEXT PRIMARY KEY,
 reset_id TEXT NOT NULL REFERENCES platform_reset_history(id),
 disposition TEXT NOT NULL CHECK(disposition IN ('ARCHIVED','DELETE_PENDING','DELETED'))
);
