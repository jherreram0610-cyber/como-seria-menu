import crypto from "node:crypto";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { query } from "../_lib/db.js";
import { isAdminRequest, requireAdmin } from "../_lib/auth.js";

interface CategoryRow {
  id: string;
  label: string;
  icon: string;
  sort_order: number;
  is_active: boolean;
}

function rowToCategory(row: CategoryRow) {
  return { id: row.id, label: row.label, icon: row.icon, isActive: row.is_active };
}

interface CreateBody {
  label?: string;
  icon?: string;
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
      `insert into categories (id, label, icon, sort_order) values ($1, $2, $3, $4) returning *`,
      [id, label.trim(), icon, sortOrder]
    );

    return res.status(201).json({ category: rows[0] });
  }

  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({ error: "Método no permitido" });
}
