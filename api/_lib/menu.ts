export const CATEGORIES = ["hamburguesas", "tenders", "combos", "adiciones", "bebidas"] as const;
export type Category = (typeof CATEGORIES)[number];

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
  return item;
}

export function groupByCategory(rows: MenuItemRow[]) {
  const grouped: Record<Category, unknown[]> = {
    hamburguesas: [],
    tenders: [],
    combos: [],
    adiciones: [],
    bebidas: [],
  };
  for (const row of rows) {
    grouped[row.category].push(rowToItem(row));
  }
  return grouped;
}
