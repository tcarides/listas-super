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

/** Crea la tabla `items` si todavía no existe. */
export async function ensureSchema() {
  if (schemaReady) return;
  const sql = getSql();
  await sql`
    CREATE TABLE IF NOT EXISTS items (
      id         BIGSERIAL PRIMARY KEY,
      name       TEXT NOT NULL,
      done       BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  schemaReady = true;
}
