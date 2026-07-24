import crypto from "node:crypto";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { query } from "../_lib/db.js";
import { isAdminRequest, requireAdmin } from "../_lib/auth.js";
import { groupByCategory, type MenuItemRow, type Category } from "../_lib/menu.js";

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
  burgerImgPosition?: string;
}

const MAX_BURGER_IMG_LENGTH = 1_500_000; // ~1.1MB de imagen ya en base64

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === "GET") {
    const wantsAll = req.query.all === "1" && isAdminRequest(req);
    // El orden sigue categories.sort_order (no el id alfabéticamente), así las
    // secciones del menú aparecen en el orden configurado desde el panel.
    const { rows } = await query(
      wantsAll
        ? `select mi.* from menu_items mi
           join categories c on c.id = mi.category
           where mi.is_deleted = false and c.is_deleted = false
           order by c.sort_order, mi.special desc, mi.sort_order, mi.created_at`
        : `select mi.* from menu_items mi
           join categories c on c.id = mi.category
           where mi.is_deleted = false and mi.is_active = true and c.is_deleted = false and c.is_active = true
           order by c.sort_order, mi.special desc, mi.sort_order, mi.created_at`
    );
    return res.status(200).json(groupByCategory(rows as MenuItemRow[]));
  }

  if (req.method === "POST") {
    if (!requireAdmin(req, res)) return;

    const body = (req.body || {}) as CreateBody;
    const { category, name, price } = body;

    if (!category) {
      return res.status(400).json({ error: "category inválida o faltante" });
    }
    const { rows: categoryRows } = await query(
      `select 1 from categories where id = $1 and is_deleted = false`,
      [category]
    );
    if (categoryRows.length === 0) {
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
        (id, category, name, price, description, ingredients, burger, combo_extra, allow_customization, is_new, popular, special, is_burger_master, burger_img, burger_img_position, sort_order)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
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
        body.burgerImgPosition || "50% 50%",
        sortOrder,
      ]
    );

    return res.status(201).json({ item: rows[0] });
  }

  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({ error: "Método no permitido" });
}
