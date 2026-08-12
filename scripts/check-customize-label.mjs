// Chequeo de SOLO LECTURA para la migración del título de personalización.
// No ejecuta ningún INSERT, UPDATE, DELETE ni ALTER: únicamente consulta.
//
// Sirve para tres momentos:
//   - Antes de migrar:  confirma que la columna todavía no existe.
//   - Después de migrar: confirma que quedó, y qué categorías faltan por llenar.
//   - Después de desplegar: muestra qué título verá el cliente en cada combo.
//
// Uso (local):      node --env-file=.env scripts/check-customize-label.mjs
// Uso (Supabase):   DATABASE_URL='<cadena de Supabase>' node scripts/check-customize-label.mjs

import pg from "pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("✗ Falta DATABASE_URL.");
  process.exit(1);
}

const isLocal = /@(localhost|127\.0\.0\.1|db):/.test(connectionString);
const client = new pg.Client({
  connectionString,
  ssl: isLocal ? false : { rejectUnauthorized: false },
});

// Mismo criterio que src/App.jsx: ignora mayúsculas y tildes.
const normalize = (s) =>
  String(s || "").trim().toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");

await client.connect();
const host = connectionString.replace(/\/\/[^@]*@/, "//***@").split("?")[0];
console.log(`\nBase de datos: ${host}`);
console.log(isLocal ? "(local)" : "(REMOTA — solo se harán consultas de lectura)\n");

try {
  const { rows: colRows } = await client.query(
    `select 1 from information_schema.columns
      where table_name = 'categories' and column_name = 'customize_label'`
  );
  const hasColumn = colRows.length > 0;

  console.log(`1. Columna categories.customize_label: ${hasColumn ? "✓ existe" : "✗ NO existe todavía"}`);
  if (!hasColumn) {
    console.log("\n   → Falta correr db/migrations/2026-08-11-customize-label.sql");
    console.log("   → Hazlo ANTES de desplegar el código, o crear/editar categorías fallará.\n");
    process.exit(0);
  }

  const { rows: cats } = await client.query(
    `select id, label, icon, customize_label
       from categories where is_deleted = false order by sort_order`
  );

  console.log("\n2. Categorías y su título de personalización:\n");
  for (const c of cats) {
    const estado = c.customize_label
      ? `"${c.icon} ${c.customize_label}"`
      : "(vacío → el cliente ve “🥬 Ingredientes”)";
    console.log(`   ${c.label.padEnd(18)} ${estado}`);
  }

  // Un combo hereda el título de la categoría del producto que incluye. Si ese
  // nombre no corresponde a ningún producto, cae al genérico — vale la pena
  // avisarlo antes de que el cliente lo vea.
  const { rows: items } = await client.query(
    `select id, name, category, burger from menu_items where is_deleted = false`
  );
  // Se excluyen los combos, igual que en src/App.jsx: un combo que se llama
  // como su producto principal no debe encontrarse a sí mismo.
  const byNormalizedName = new Map(
    items.filter((i) => i.category !== "combos").map((i) => [normalize(i.name), i])
  );
  const catById = new Map(cats.map((c) => [c.id, c]));
  const combos = items.filter((i) => i.category === "combos");

  console.log("\n3. Qué título verá el cliente en cada combo:\n");
  const huerfanos = [];
  for (const combo of combos) {
    const principal = byNormalizedName.get(normalize(combo.burger));
    const cat = principal ? catById.get(principal.category) : null;
    const titulo = cat?.customize_label
      ? `${cat.icon} ${cat.customize_label}`
      : "🥬 Ingredientes";
    if (!principal) huerfanos.push(combo);
    console.log(
      `   ${combo.name.padEnd(24)} → ${titulo}` +
        (principal ? "" : `   ⚠ no encontré el producto "${combo.burger}"`)
    );
  }

  if (huerfanos.length > 0) {
    console.log(
      `\n   ⚠ ${huerfanos.length} combo(s) apuntan a un producto que no existe con ese nombre.`
    );
    console.log("     Se ven bien igual (muestran el texto genérico), pero para que tomen");
    console.log("     el título correcto hay que corregir el campo “Producto principal");
    console.log("     incluido” desde Admin → Menú.");
  }

  const sinLlenar = cats.filter((c) => !c.customize_label);
  if (sinLlenar.length > 0) {
    console.log(`\n4. Categorías sin título configurado: ${sinLlenar.map((c) => c.label).join(", ")}`);
    console.log("   Se llenan desde Admin → Categorías → “Título al personalizar”.");
  } else {
    console.log("\n4. Todas las categorías tienen su título configurado.");
  }

  console.log("");
} finally {
  await client.end();
}
