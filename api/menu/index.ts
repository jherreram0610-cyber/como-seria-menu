import crypto from "node:crypto";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { query } from "../_lib/db";
import { isAdminRequest, requireAdmin } from "../_lib/auth";
import { CATEGORIES, groupByCategory, type MenuItemRow, type Category } from "../_lib/menu";

interface CreateBody {
  category?: Category;
  name?: string;
  price?: number;
  desc?: string;
  ingredients?: string[];
  burger?: string;
  comboExtra?: number;
  allowCustomization?: boolean;
  isNew?: boolean;
  popular?: boolean;
  special?: boolean;
  isBurgerMaster?: boolean;
  burgerImg?: string;
}

const MAX_BURGER_IMG_LENGTH = 1_500_000; // ~1.1MB de imagen ya en base64

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === "GET") {
    const wantsAll = req.query.all === "1" && isAdminRequest(req);
    const { rows } = await query(
      wantsAll
        ? `select * from menu_items order by category, special desc, sort_order, created_at`
        : `select * from menu_items where is_active = true order by category, special desc, sort_order, created_at`
    );
    return res.status(200).json(groupByCategory(rows as MenuItemRow[]));
  }

  if (req.method === "POST") {
    if (!requireAdmin(req, res)) return;

    const body = (req.body || {}) as CreateBody;
    const { category, name, price } = body;

    if (!category || !CATEGORIES.includes(category)) {
      return res.status(400).json({ error: "category inválida o faltante" });
    }
    if (!name || !name.trim()) {
      return res.status(400).json({ error: "name es requerido" });
    }
    if (typeof price !== "number" || !Number.isFinite(price) || price < 0) {
      return res.status(400).json({ error: "price debe ser un número válido" });
    }
    if (body.burgerImg && body.burgerImg.length > MAX_BURGER_IMG_LENGTH) {
      return res.status(400).json({ error: "La imagen es demasiado grande" });
    }

    const id = crypto.randomUUID();
    const { rows: orderRows } = await query(
      `select coalesce(max(sort_order), -1) + 1 as next from menu_items where category = $1`,
      [category]
    );
    const sortOrder = orderRows[0].next;

    const { rows } = await query(
      `insert into menu_items
        (id, category, name, price, description, ingredients, burger, combo_extra, allow_customization, is_new, popular, special, is_burger_master, burger_img, sort_order)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
       returning *`,
      [
        id,
        category,
        name.trim(),
        Math.round(price),
        body.desc || null,
        JSON.stringify(body.ingredients || []),
        body.burger || null,
        body.comboExtra ?? null,
        body.allowCustomization !== false,
        !!body.isNew,
        !!body.popular,
        !!body.special,
        !!body.isBurgerMaster,
        body.burgerImg || null,
        sortOrder,
      ]
    );

    return res.status(201).json({ item: rows[0] });
  }

  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({ error: "Método no permitido" });
}
