import { Pool } from "pg";

// Reutiliza el pool entre invocaciones cálidas de la misma función serverless.
// max: 1 porque Supabase ya agrupa las conexiones (pooled connection string, puerto 6543).
declare global {
  // eslint-disable-next-line no-var
  var _pgPool: Pool | undefined;
}

export function getPool(): Pool {
  if (!global._pgPool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error("DATABASE_URL no configurada en el servidor");
    }
    // Postgres local (Docker) no habla SSL; Supabase en producción sí lo exige.
    const isLocal = /@(localhost|127\.0\.0\.1|db):/.test(connectionString);
    global._pgPool = new Pool({
      connectionString,
      max: 1,
      ssl: isLocal ? false : { rejectUnauthorized: false },
    });
  }
  return global._pgPool;
}

export function query(text: string, params?: unknown[]) {
  return getPool().query(text, params);
}
