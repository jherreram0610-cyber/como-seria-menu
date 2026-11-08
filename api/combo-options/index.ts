import crypto from "node:crypto";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { query } from "../_lib/db.js";
import { isAdminRequest, requireAdmin } from "../_lib/auth.js";
import { isComboOptionKind, rowToComboOption, type ComboOptionRow } from "../_lib/comboOptions.js";

interface CreateBody {
  kind?: string;
  name?: string;
  price?: number;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === "GET") {
    const wantsAll = req.query.all === "1" && isAdminRequest(req);
    const { rows } = await query(
      wantsAll
        ? `select * from combo_options where is_deleted = false order by kind, sort_order, created_at`
        : `select * from combo_options where is_deleted = false and is_active = true order by kind, sort_order, created_at`
    );
    return res.status(200).json({ comboOptions: (rows as ComboOptionRow[]).map(rowToComboOption) });
  }

  if (req.method === "POST") {
    if (!requireAdmin(req, res)) return;

    const body = (req.body || {}) as CreateBody;
    if (!isComboOptionKind(body.kind)) {
      return res.status(400).json({ error: "kind debe ser 'acompanamiento' o 'mejora'" });
    }
    if (!body.name || !body.name.trim()) {
      return res.status(400).json({ error: "name es requerido" });
    }
    if (typeof body.price !== "number" || !Number.isFinite(body.price) || body.price < 0) {
      return res.status(400).json({ error: "price debe ser un número válido" });
    }

    const id = crypto.randomUUID();
    const { rows: orderRows } = await query(
      `select coalesce(max(sort_order), -1) + 1 as next from combo_options where kind = $1`,
      [body.kind]
    );
    const { rows } = await query(
      `insert into combo_options (id, kind, name, price, sort_order) values ($1, $2, $3, $4, $5) returning *`,
      [id, body.kind, body.name.trim(), Math.round(body.price), orderRows[0].next]
    );
    return res.status(201).json({ comboOption: rowToComboOption(rows[0] as ComboOptionRow) });
  }

  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({ error: "Método no permitido" });
}
