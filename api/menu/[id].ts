import type { VercelRequest, VercelResponse } from "@vercel/node";
import { query } from "../_lib/db";
import { requireAdmin } from "../_lib/auth";

interface UpdateBody {
  name?: string;
  price?: number;
  desc?: string;
  ingredients?: string[];
  burger?: string | null;
  comboExtra?: number | null;
  allowCustomization?: boolean;
  isNew?: boolean;
  popular?: boolean;
  special?: boolean;
  isBurgerMaster?: boolean;
  burgerImg?: string | null;
}

const MAX_BURGER_IMG_LENGTH = 1_500_000; // ~1.1MB de imagen ya en base64

const FIELD_MAP: Record<keyof UpdateBody, string> = {
  name: "name",
  price: "price",
  desc: "description",
  ingredients: "ingredients",
  burger: "burger",
  comboExtra: "combo_extra",
  allowCustomization: "allow_customization",
  isNew: "is_new",
  popular: "popular",
  special: "special",
  isBurgerMaster: "is_burger_master",
  burgerImg: "burger_img",
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!requireAdmin(req, res)) return;

  const { id } = req.query;
  if (!id || typeof id !== "string") {
    return res.status(400).json({ error: "id es requerido" });
  }

  if (req.method === "PUT") {
    const body = (req.body || {}) as UpdateBody;
    if (body.burgerImg && body.burgerImg.length > MAX_BURGER_IMG_LENGTH) {
      return res.status(400).json({ error: "La imagen es demasiado grande" });
    }
    const sets: string[] = [];
    const values: unknown[] = [];

    (Object.keys(FIELD_MAP) as (keyof UpdateBody)[]).forEach((key) => {
      if (!(key in body)) return;
      let value = body[key];
      if (key === "ingredients") value = JSON.stringify(value ?? []) as never;
      if (key === "price" && typeof value === "number") value = Math.round(value) as never;
      values.push(value);
      sets.push(`${FIELD_MAP[key]} = $${values.length}`);
    });

    if (sets.length === 0) {
      return res.status(400).json({ error: "No hay campos para actualizar" });
    }

    values.push(id);
    const { rows } = await query(
      `update menu_items set ${sets.join(", ")}, updated_at = now() where id = $${values.length} returning *`,
      values
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: "Producto no encontrado" });
    }
    return res.status(200).json({ item: rows[0] });
  }

  if (req.method === "PATCH") {
    const { isActive } = (req.body || {}) as { isActive?: boolean };
    if (typeof isActive !== "boolean") {
      return res.status(400).json({ error: "isActive (boolean) es requerido" });
    }
    const { rows } = await query(
      `update menu_items set is_active = $1, updated_at = now() where id = $2 returning *`,
      [isActive, id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: "Producto no encontrado" });
    }
    return res.status(200).json({ item: rows[0] });
  }

  res.setHeader("Allow", "PUT, PATCH");
  return res.status(405).json({ error: "Método no permitido" });
}
