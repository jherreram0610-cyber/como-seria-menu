// Aplica las migraciones pendientes de db/migrations/ a la base de datos.
//
// Corre solo durante el build (ver "build" en package.json), así que cada
// despliegue lleva la base al día antes de que el código nuevo reciba tráfico.
// También se puede correr a mano: npm run db:migrate
//
// Reglas que se hace cumplir a sí mismo:
//  - Cada archivo se aplica UNA sola vez (se registra en la tabla schema_migrations).
//  - Todo va dentro de una transacción: si algo falla, no queda a medias.
//  - Se RECHAZAN las migraciones destructivas (borrar tablas, columnas o filas).
//    Este proyecto solo agrega; los datos existentes no se tocan nunca.

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import pg from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.join(__dirname, "..", "db", "migrations");

// Supabase entrega dos cadenas: la "pooled" (6543, la que usa la app) y la
// directa (5432). Para DDL conviene la directa si está disponible, pero la
// pooled también funciona para lo que hacemos acá.
const connectionString = process.env.MIGRATION_DATABASE_URL || process.env.DATABASE_URL;

if (!connectionString) {
  // Sin base de datos no hay nada que migrar: es el caso de un build local o de
  // un entorno donde solo se compila el frontend. Se avisa fuerte para que no
  // pase inadvertido si faltó configurar la variable en el proveedor.
  console.warn("⚠ migrate: no hay DATABASE_URL, se omiten las migraciones.");
  console.warn("  Si esto es un despliegue de producción, configúrala: el código");
  console.warn("  nuevo puede necesitar columnas que todavía no existen.");
  process.exit(0);
}

// Patrones que destruyen datos o estructura. La intención del proyecto es que
// las migraciones solo agreguen; "eliminar" en la app siempre es is_deleted.
const DESTRUCTIVE = [
  { re: /\bdrop\s+table\b/i, what: "DROP TABLE" },
  { re: /\bdrop\s+column\b/i, what: "DROP COLUMN" },
  { re: /\bdrop\s+database\b/i, what: "DROP DATABASE" },
  { re: /\btruncate\b/i, what: "TRUNCATE" },
  { re: /\bdelete\s+from\b/i, what: "DELETE FROM" },
];

// Quita comentarios antes de revisar, para no bloquear por una palabra que solo
// aparece explicada en un comentario.
function stripSqlComments(sql) {
  return sql.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n]*/g, " ");
}

function assertNotDestructive(name, sql) {
  const code = stripSqlComments(sql);
  for (const { re, what } of DESTRUCTIVE) {
    if (re.test(code)) {
      throw new Error(
        `La migración "${name}" contiene ${what}. Este proyecto no borra datos: ` +
          `si de verdad hace falta, corre esa sentencia a mano y con respaldo.`
      );
    }
  }
}

const files = readdirSync(migrationsDir)
  .filter((f) => f.endsWith(".sql"))
  .sort(); // el nombre empieza con la fecha, así que el orden alfabético es el cronológico

const client = new pg.Client({
  connectionString,
  ssl: /@(localhost|127\.0\.0\.1|db):/.test(connectionString)
    ? false
    : { rejectUnauthorized: false },
});

await client.connect();

try {
  await client.query(`
    create table if not exists schema_migrations (
      name       text primary key,
      applied_at timestamptz not null default now()
    )
  `);

  const { rows } = await client.query(`select name from schema_migrations`);
  const applied = new Set(rows.map((r) => r.name));
  const pending = files.filter((f) => !applied.has(f));

  if (pending.length === 0) {
    console.log(`✓ migrate: la base ya está al día (${files.length} migración/es).`);
  }

  for (const name of pending) {
    const sql = readFileSync(path.join(migrationsDir, name), "utf8");
    assertNotDestructive(name, sql);

    await client.query("begin");
    try {
      // Serializa contra otros builds que estén desplegando al mismo tiempo.
      // De transacción (no de sesión) para que funcione con el pooler de Supabase.
      await client.query(`select pg_advisory_xact_lock(hashtext('comoseria_migrations'))`);

      // Se vuelve a comprobar ya con el lock tomado: otro build pudo haberla
      // aplicado mientras esperábamos.
      const { rows: check } = await client.query(
        `select 1 from schema_migrations where name = $1`,
        [name]
      );
      if (check.length > 0) {
        await client.query("rollback");
        console.log(`· migrate: ${name} ya la aplicó otro despliegue.`);
        continue;
      }

      await client.query(sql);
      await client.query(`insert into schema_migrations (name) values ($1)`, [name]);
      await client.query("commit");
      console.log(`✓ migrate: aplicada ${name}`);
    } catch (err) {
      await client.query("rollback").catch(() => {});
      throw err;
    }
  }
} catch (err) {
  console.error(`\n✗ migrate: falló — ${err.message}\n`);
  // Se corta el build a propósito: es preferible no desplegar a dejar el código
  // nuevo corriendo contra una base que le falta lo que necesita.
  process.exit(1);
} finally {
  await client.end();
}
