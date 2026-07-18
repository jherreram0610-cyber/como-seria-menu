// Crea las tablas (si no existen) e inserta el menú actual una sola vez.
// No sobrescribe productos existentes (ON CONFLICT DO NOTHING), así que correrlo
// de nuevo después de que el restaurante haya editado algo desde el panel es seguro.
//
// Uso: node --env-file=.env scripts/seed-menu.mjs
// Requiere DATABASE_URL en el entorno (usar la conexión directa, puerto 5432, para esto).

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import crypto from "node:crypto";
import pg from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const MENU = {
  hamburguesas: [
    {
      id: "bm2026", name: "Cali Vibes", price: 30900,
      desc: "Carne Angus 180gr, Mermelada de lulo, Maduro caramelizado, Lechuga y Salsa de la casa",
      ingredients: ["Pan", "Carne Angus", "Lechuga", "Maduro caramelizado", "Mermelada de lulo", "Salsa de la casa"],
      isBurgerMaster: true, special: true,
    },
    { id: "h1", name: "La Clásica", price: 25500, desc: "Carne angus 180gr, lechuga, tomate, cebolla, queso y salsa de la casa", ingredients: ["Carne angus", "Lechuga", "Tomate", "Cebolla", "Queso", "Salsa de la casa"], popular: true },
    { id: "h2", name: "Cheese Bacon", price: 27900, desc: "Doble carne angus 90gr, tocineta, doble queso y salsa de la casa", ingredients: ["Doble carne angus", "Tocineta", "Doble queso", "Salsa de la casa"] },
    { id: "h3", name: "Philly Pork", price: 32900, desc: "Carne angus 180gr, pan brioche, queso americano, pulled pork, cebolla crispy, queso Philadelphia", ingredients: ["Carne angus", "Pan brioche", "Queso americano", "Pulled pork", "Cebolla crispy", "Queso Philadelphia"], popular: true },
    { id: "h4", name: "La Crunchy", price: 28900, desc: "Carne angus 180gr, queso crema, tocineta, cebolla crispy, queso y salsa BBQ", ingredients: ["Carne angus", "Queso crema", "Tocineta", "Cebolla crispy", "Queso", "Salsa BBQ"] },
    { id: "h5", name: "Chicken Crunch", price: 26900, desc: "Pan brioche, tenders, queso americano, tocineta, tomate y lechuga", ingredients: ["Pan brioche", "Tenders", "Queso americano", "Tocineta", "Tomate", "Lechuga"] },
    { id: "h6", name: "La Callejera", price: 28900, desc: "Carne angus 180gr, pan brioche, tocineta, queso doble crema, cebolla, tomate, ripio de papa", ingredients: ["Carne angus", "Pan brioche", "Tocineta", "Queso doble crema", "Cebolla", "Tomate", "Ripio de papa"] },
  ],
  tenders: [
    { id: "t1", name: "Tenders x3", price: 23900, desc: "3 tenders crujientes con papas", ingredients: [], allowCustomization: false },
    { id: "t2", name: "Tenders x6", price: 40900, desc: "6 tenders crujientes con papas", ingredients: [], allowCustomization: false },
  ],
  combos: [
    { id: "c7", name: "Combo Cali Vibes", price: 40900, desc: "Cali Vibes + Papas fritas + Bebida a tu gusto", burger: "Cali Vibes", ingredients: ["Pan", "Carne Angus", "Lechuga", "Maduro caramelizado", "Mermelada de lulo", "Salsa de la casa"] },
    { id: "c1", name: "Combo La Clásica", price: 35500, desc: "La Clásica + Papas fritas + Bebida a tu gusto", burger: "La Clásica", ingredients: ["Carne angus", "Lechuga", "Tomate", "Cebolla", "Queso", "Salsa de la casa"] },
    { id: "c2", name: "Combo Philly Pork", price: 42900, desc: "Philly Pork + Papas fritas + Bebida a tu gusto", burger: "Philly Pork", ingredients: ["Carne angus", "Pan brioche", "Queso americano", "Pulled pork", "Cebolla crispy", "Queso Philadelphia"] },
    { id: "c3", name: "Combo Chicken Crunch", price: 36900, desc: "Chicken Crunch + Papas fritas + Bebida a tu gusto", burger: "Chicken Crunch", ingredients: ["Pan brioche", "Tenders", "Queso americano", "Tocineta", "Tomate", "Lechuga"] },
    { id: "c4", name: "Combo Cheese Bacon", price: 37900, desc: "Cheese Bacon + Papas fritas + Bebida a tu gusto", burger: "Cheese Bacon", ingredients: ["Doble carne angus", "Tocineta", "Doble queso", "Salsa de la casa"] },
    { id: "c5", name: "Combo La Crunchy", price: 38900, desc: "La Crunchy + Papas fritas + Bebida a tu gusto", burger: "La Crunchy", ingredients: ["Carne angus", "Queso crema", "Tocineta", "Cebolla crispy", "Queso", "Salsa BBQ"] },
    { id: "c6", name: "Combo La Callejera", price: 38900, desc: "La Callejera + Papas fritas + Bebida a tu gusto", burger: "La Callejera", ingredients: ["Carne angus", "Pan brioche", "Tocineta", "Queso doble crema", "Cebolla", "Tomate", "Ripio de papa"] },
  ],
  adiciones: [
    { id: "a1", name: "Tocineta", price: 2500 },
    { id: "a2", name: "Queso", price: 2500 },
    { id: "a3", name: "Cebolla Crispy", price: 2000 },
    { id: "a4", name: "Queso Philadelphia", price: 3000 },
    { id: "a5", name: "Pepinillos", price: 2000 },
    { id: "a6", name: "Pulled Pork", price: 6000 },
    { id: "a7", name: "Carne Angus", price: 8000 },
    { id: "a8", name: "Papas", price: 6500 },
    { id: "a10", name: "Papas Lemon Pepper", price: 6500 },
  ],
  bebidas: [
    { id: "b1", name: "Coca Cola", price: 6000 },
    { id: "b2", name: "Coca Cola Zero", price: 6000 },
    { id: "b3", name: "Sprite", price: 6000 },
    { id: "b4", name: "Quatro", price: 6000 },
    { id: "b5", name: "Ginger", price: 6000 },
    { id: "b6", name: "Kola Román", price: 6000 },
    { id: "b7", name: "Fuze Tea Limón", price: 6500 },
    { id: "b8", name: "Fuze Tea Durazno", price: 6500 },
    { id: "b9", name: "Fuze Tea Manzana", price: 6500 },
    { id: "b10", name: "Agua Brisa Manzana", price: 6000 },
    { id: "b11", name: "Agua Brisa Maracuyá", price: 6000 },
    { id: "b12", name: "Agua Brisa Limón", price: 6000 },
    { id: "b13", name: "Agua", price: 5000 },
    { id: "b14", name: "Agua con Gas", price: 5000 },
    { id: "b15", name: "Soda Tropical", price: 10000, isNew: true, comboExtra: 5000 },
    { id: "b16", name: "Soda Lulo", price: 10000, isNew: true, comboExtra: 5000 },
    { id: "b17", name: "Soda Maracuyá", price: 10000, isNew: true, comboExtra: 5000 },
  ],
};

const DELIVERY_LOCATIONS = [
  { id: "cc", name: "Ciudad Country", price: 5000 },
  { id: "cs", name: "5 Soles", price: 7000 },
  { id: "ec", name: "El Castillo", price: 8000 },
  { id: "pg", name: "Pangola", price: 8000 },
];

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("Falta DATABASE_URL. Corre con: node --env-file=.env scripts/seed-menu.mjs");
  }

  const client = new pg.Client({ connectionString, ssl: connectionString.includes("localhost") ? false : { rejectUnauthorized: false } });
  await client.connect();

  try {
    const schema = readFileSync(path.join(__dirname, "..", "db", "schema.sql"), "utf8");
    await client.query(schema);
    console.log("✓ Tablas verificadas/creadas");

    let inserted = 0;
    for (const [category, items] of Object.entries(MENU)) {
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const result = await client.query(
          `insert into menu_items
            (id, category, name, price, description, ingredients, burger, combo_extra, allow_customization, is_new, popular, special, is_burger_master, burger_img, sort_order)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
           on conflict (id) do nothing`,
          [
            item.id,
            category,
            item.name,
            item.price,
            item.desc || null,
            JSON.stringify(item.ingredients || []),
            item.burger || null,
            item.comboExtra ?? null,
            item.allowCustomization !== false,
            !!item.isNew,
            !!item.popular,
            !!item.special,
            !!item.isBurgerMaster,
            item.burgerImg || null,
            i,
          ]
        );
        if (result.rowCount > 0) inserted++;
      }
    }
    console.log(`✓ ${inserted} producto(s) nuevo(s) insertado(s) (los existentes no se tocaron)`);

    let insertedLocations = 0;
    for (let i = 0; i < DELIVERY_LOCATIONS.length; i++) {
      const loc = DELIVERY_LOCATIONS[i];
      const result = await client.query(
        `insert into delivery_locations (id, name, price, sort_order)
         values ($1, $2, $3, $4)
         on conflict (id) do nothing`,
        [loc.id, loc.name, loc.price, i]
      );
      if (result.rowCount > 0) insertedLocations++;
    }
    console.log(`✓ ${insertedLocations} zona(s) de domicilio nueva(s) insertada(s)`);

    const adminPassword = process.env.ADMIN_PASSWORD;
    if (adminPassword) {
      const salt = crypto.randomBytes(16).toString("hex");
      const hash = crypto.scryptSync(adminPassword, salt, 64).toString("hex");
      const result = await client.query(
        `insert into admin_settings (id, password_hash) values ('singleton', $1) on conflict (id) do nothing`,
        [`${salt}:${hash}`]
      );
      console.log(
        result.rowCount > 0
          ? "✓ Contraseña de admin inicial sembrada desde ADMIN_PASSWORD"
          : "✓ Ya existía una contraseña de admin guardada (no se tocó)"
      );
    }

    const adminDeletePin = process.env.ADMIN_DELETE_PIN;
    if (adminDeletePin) {
      // Se revisa el estado real antes de decidir qué hacer, para no confundir
      // "ya existía un PIN" con "la fila admin_settings ni siquiera existe todavía"
      // (este segundo caso antes quedaba en silencio con un UPDATE que no tocaba nada).
      const { rows: existingRows } = await client.query(
        `select delete_pin_hash from admin_settings where id = 'singleton'`
      );
      if (existingRows.length === 0) {
        console.log(
          "✗ No se pudo sembrar el PIN de eliminación: la fila admin_settings no existe todavía " +
          "(corre este script con ADMIN_PASSWORD configurado al menos una vez antes)"
        );
      } else if (existingRows[0].delete_pin_hash) {
        console.log("✓ Ya existía un PIN de eliminación guardado (no se tocó)");
      } else {
        const salt = crypto.randomBytes(16).toString("hex");
        const hash = crypto.scryptSync(adminDeletePin, salt, 64).toString("hex");
        // Update simple (no INSERT ... ON CONFLICT): Postgres valida las columnas
        // NOT NULL de la fila propuesta en un INSERT aunque termine en UPDATE por
        // el conflicto, y password_hash no se está enviando aquí.
        await client.query(
          `update admin_settings set delete_pin_hash = $1 where id = 'singleton'`,
          [`${salt}:${hash}`]
        );
        console.log("✓ PIN de eliminación inicial sembrado desde ADMIN_DELETE_PIN");
      }
    }
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("✗ Error corriendo el seed:", err.message);
  process.exit(1);
});
