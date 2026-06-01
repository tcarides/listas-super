import { neon } from "@neondatabase/serverless";

let _sql;

/**
 * Devuelve el cliente SQL de Neon, creándolo la primera vez.
 * Lee la cadena de conexión desde las variables de entorno que
 * inyecta la integración de Postgres/Neon en Vercel.
 */
export function getSql() {
  if (_sql) return _sql;
  const connectionString =
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    process.env.POSTGRES_PRISMA_URL;
  if (!connectionString) {
    throw new Error(
      "Falta la variable de entorno de la base de datos (DATABASE_URL / POSTGRES_URL)."
    );
  }
  _sql = neon(connectionString);
  return _sql;
}

let schemaReady = false;

/**
 * Crea/actualiza las tablas si hace falta.
 *  - categories: secciones del súper (Condimentos, Lácteos…)
 *  - items: productos del catálogo, con dos estados:
 *      needed  = está marcado para esta compra
 *      checked = ya lo agarré (tachado)
 */
export async function ensureSchema() {
  if (schemaReady) return;
  const sql = getSql();

  await sql`
    CREATE TABLE IF NOT EXISTS categories (
      id       BIGSERIAL PRIMARY KEY,
      name     TEXT NOT NULL,
      position INT NOT NULL DEFAULT 0
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS items (
      id          BIGSERIAL PRIMARY KEY,
      name        TEXT NOT NULL,
      category_id BIGINT,
      needed      BOOLEAN NOT NULL DEFAULT FALSE,
      checked     BOOLEAN NOT NULL DEFAULT FALSE,
      quantity    INT NOT NULL DEFAULT 1,
      note        TEXT,
      position    INT NOT NULL DEFAULT 0,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  // Migración desde el modelo anterior (tabla items con solo name/done).
  await sql`ALTER TABLE items ADD COLUMN IF NOT EXISTS category_id BIGINT`;
  await sql`ALTER TABLE items ADD COLUMN IF NOT EXISTS needed BOOLEAN NOT NULL DEFAULT FALSE`;
  await sql`ALTER TABLE items ADD COLUMN IF NOT EXISTS checked BOOLEAN NOT NULL DEFAULT FALSE`;
  await sql`ALTER TABLE items ADD COLUMN IF NOT EXISTS quantity INT NOT NULL DEFAULT 1`;
  await sql`ALTER TABLE items ADD COLUMN IF NOT EXISTS note TEXT`;
  await sql`ALTER TABLE items ADD COLUMN IF NOT EXISTS position INT NOT NULL DEFAULT 0`;

  schemaReady = true;
}
