// api/_db.js — Acceso a Postgres para cuentas, cuota y proyectos.
// MISMA base de datos que el builder (crear.dmdmx.dev): process.env.
// DATABASE_URL. Sin ella, query() lanza con code 'NO_DB' y cada
// endpoint responde 503 { db:false }.
// La única diferencia con el builder: la tabla users lleva además
// is_admin (BOOLEAN, FALSE por defecto). El ALTER de abajo la añade
// a bases ya creadas por el builder, sin tocar nada más.
let pool = null;
let schemaReady = false;

function hasDb() {
  return !!process.env.DATABASE_URL;
}

function getPool() {
  if (!process.env.DATABASE_URL) {
    const e = new Error('DATABASE_URL no configurada en el servidor');
    e.code = 'NO_DB';
    throw e;
  }
  if (!pool) {
    // 'pg' es dependencia del repo (package.json). Pool pequeño:
    // las funciones serverless son efímeras, 2 conexiones bastan.
    const { Pool } = require('pg');
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
      max: 2,
      idleTimeoutMillis: 10000,
      connectionTimeoutMillis: 5000
    });
  }
  return pool;
}

// DDL idempotente (mismo contenido que schema.sql, para que el primer
// uso cree las tablas sin migración manual).
const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  pass_hash TEXT NOT NULL,
  promo BOOLEAN NOT NULL DEFAULT FALSE,
  used_count INTEGER NOT NULL DEFAULT 0,
  is_admin BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- La DB ya existe (la creó el builder): añade is_admin si falta.
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT FALSE;
CREATE UNIQUE INDEX IF NOT EXISTS users_email_unique ON users (LOWER(email));
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions (user_id);
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  slug TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  spec JSONB NOT NULL DEFAULT '{}'::jsonb,
  html TEXT NOT NULL DEFAULT '',
  files JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, slug)
);
CREATE INDEX IF NOT EXISTS projects_user_idx ON projects (user_id, updated_at DESC);
CREATE TABLE IF NOT EXISTS anon_usage (
  ip_hash TEXT PRIMARY KEY,
  count INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
`;

async function ensureSchema() {
  if (schemaReady) return;
  await getPool().query(SCHEMA_SQL);
  schemaReady = true;
}

async function query(text, params) {
  await ensureSchema();
  return getPool().query(text, params);
}

module.exports = { hasDb, query, ensureSchema, getPool };
