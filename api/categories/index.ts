import crypto from "node:crypto";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { query } from "../_lib/db.js";
import { isAdminRequest, requireAdmin } from "../_lib/auth.js";

interface CategoryRow {
  id: string;
  label: string;
  icon: string;
  customize_label: string | null;
  sort_order: number;
  is_active: boolean;
}

function rowToCategory(row: CategoryRow) {
  return {
    id: row.id,
    label: row.label,
    icon: row.icon,
    // Texto de la sección de personalización que ve el cliente; vacío = genérico.
    customizeLabel: row.customize_label || "",
    isActive: row.is_active,
  };
}

interface CreateBody {
  label?: string;
  icon?: string;
  customizeLabel?: string;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === "GET") {
    const wantsAll = req.query.all === "1" && isAdminRequest(req);
    const { rows } = await query(
      wantsAll
        ? `select * from categories where is_deleted = false order by sort_order, created_at`
        : `select * from categories where is_deleted = false and is_active = true order by sort_order, created_at`
    );
    return res.status(200).json({ categories: (rows as CategoryRow[]).map(rowToCategory) });
  }

  if (req.method === "POST") {
    if (!requireAdmin(req, res)) return;

    const body = (req.body || {}) as CreateBody;
    const { label } = body;
    if (!label || !label.trim()) {
      return res.status(400).json({ error: "label es requerido" });
    }

    const id = crypto.randomUUID();
    const icon = body.icon?.trim() || "🍽️";
    const { rows: orderRows } = await query(`select coalesce(max(sort_order), -1) + 1 as next from categories`);
    const sortOrder = orderRows[0].next;

    const { rows } = await query(
      `insert into categories (id, label, icon, customize_label, sort_order)
       values ($1, $2, $3, $4, $5) returning *`,
      [id, label.trim(), icon, body.customizeLabel?.trim() || null, sortOrder]
    );

    return res.status(201).json({ category: rowToCategory(rows[0] as CategoryRow) });
  }

  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({ error: "Método no permitido" });
}
