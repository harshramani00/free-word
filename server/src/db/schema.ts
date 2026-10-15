import { DatabaseSync } from 'node:sqlite'

/** Opens (or creates) the database and brings it to the current schema. */
export function openDatabase(file: string): DatabaseSync {
  const db = new DatabaseSync(file)
  if (file !== ':memory:') db.exec('PRAGMA journal_mode = WAL')
  db.exec('PRAGMA foreign_keys = ON')
  db.exec('PRAGMA busy_timeout = 5000')
  migrate(db)
  return db
}

const MIGRATIONS: string[] = [
  `
  CREATE TABLE users (
    id TEXT PRIMARY KEY,
    google_sub TEXT UNIQUE,
    email TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    last_login_at INTEGER NOT NULL
  );

  CREATE TABLE documents (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id),
    name TEXT NOT NULL,
    path TEXT NOT NULL DEFAULT '',
    current_version INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    deleted_at INTEGER
  );
  CREATE INDEX documents_user ON documents(user_id, deleted_at);

  CREATE TABLE versions (
    doc_id TEXT NOT NULL REFERENCES documents(id),
    n INTEGER NOT NULL,
    size INTEGER NOT NULL,
    sha256 TEXT NOT NULL,
    updated_by TEXT NOT NULL CHECK (updated_by IN ('user', 'claude')),
    note TEXT,
    base_version INTEGER,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (doc_id, n)
  );

  CREATE TABLE change_log (
    seq INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    doc_id TEXT NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('version', 'rename', 'delete', 'restore')),
    version INTEGER,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX change_log_user ON change_log(user_id, seq);

  CREATE TABLE oauth_clients (
    client_id TEXT PRIMARY KEY,
    client_secret_hash TEXT,
    client_name TEXT NOT NULL,
    redirect_uris TEXT NOT NULL,
    token_endpoint_auth_method TEXT NOT NULL,
    builtin INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE login_states (
    state TEXT PRIMARY KEY,
    nonce TEXT NOT NULL,
    authorize_params TEXT NOT NULL,
    user_id TEXT,
    expires_at INTEGER NOT NULL
  );

  CREATE TABLE auth_codes (
    code_hash TEXT PRIMARY KEY,
    client_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    redirect_uri TEXT NOT NULL,
    scope TEXT NOT NULL,
    code_challenge TEXT NOT NULL,
    resource TEXT,
    expires_at INTEGER NOT NULL,
    used_at INTEGER
  );

  CREATE TABLE grants (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id),
    client_id TEXT NOT NULL,
    client_name TEXT NOT NULL,
    scope TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    last_used_at INTEGER,
    revoked_at INTEGER
  );
  CREATE INDEX grants_user ON grants(user_id, revoked_at);

  CREATE TABLE refresh_tokens (
    token_hash TEXT PRIMARY KEY,
    grant_id TEXT NOT NULL REFERENCES grants(id),
    expires_at INTEGER NOT NULL,
    used_at INTEGER,
    replaced_by TEXT
  );

  CREATE TABLE register_attempts (
    ip TEXT NOT NULL,
    at INTEGER NOT NULL
  );
  `
]

export function migrate(db: DatabaseSync): void {
  const row = db.prepare('PRAGMA user_version').get() as { user_version: number }
  let version = Number(row.user_version)
  while (version < MIGRATIONS.length) {
    db.exec('BEGIN')
    try {
      db.exec(MIGRATIONS[version])
      version += 1
      db.exec(`PRAGMA user_version = ${version}`)
      db.exec('COMMIT')
    } catch (err) {
      db.exec('ROLLBACK')
      throw err
    }
  }
}
