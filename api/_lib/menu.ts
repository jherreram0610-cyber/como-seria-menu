// Las categorías ya no son un enum fijo: viven en la tabla `categories`
// (editable/reordenable desde el panel), así que aquí `category` es un id
// de texto libre (referenciado por foreign key en la base de datos).
export type Category = string;

export interface MenuItemRow {
  id: string;
  category: Category;
  name: string;
  price: number;
  description: string | null;
  ingredients: string[];
  burger: string | null;
  combo_extra: number | null;
  allow_customization: boolean;
  is_new: boolean;
  popular: boolean;
  special: boolean;
  is_burger_master: boolean;
  burger_img: string | null;
  burger_img_position: string | null;
  sort_order: number;
  is_active: boolean;
}

export function rowToItem(row: MenuItemRow) {
  const item: Record<string, unknown> = {
    id: row.id,
    category: row.category,
    name: row.name,
    price: row.price,
    desc: row.description || "",
    ingredients: row.ingredients || [],
    allowCustomization: row.allow_customization,
    isActive: row.is_active,
  };
  if (row.burger) item.burger = row.burger;
  if (row.combo_extra != null) item.comboExtra = row.combo_extra;
  if (row.is_new) item.isNew = true;
  if (row.popular) item.popular = true;
  if (row.special) item.special = true;
  if (row.is_burger_master) item.isBurgerMaster = true;
  if (row.burger_img) item.burgerImg = row.burger_img;
  item.burgerImgPosition = row.burger_img_position || "50% 50%";
  return item;
}

// Agrupa dinámicamente por la categoría real de cada fila (en vez de
// preasignar un set fijo de claves), así respeta cualquier categoría nueva
// creada desde el panel. El orden de las claves sigue el orden de `rows`
// (el caller debe ordenar por categories.sort_order antes de llamar esto).
export function groupByCategory(rows: MenuItemRow[]) {
  const grouped: Record<string, unknown[]> = {};
  for (const row of rows) {
    if (!grouped[row.category]) grouped[row.category] = [];
    grouped[row.category].push(rowToItem(row));
  }
  return grouped;
}
