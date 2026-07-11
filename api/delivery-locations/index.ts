import crypto from "node:crypto";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { query } from "../_lib/db.ts";
import { isAdminRequest, requireAdmin } from "../_lib/auth.ts";

interface LocationRow {
  id: string;
  name: string;
  price: number;
  sort_order: number;
  is_active: boolean;
}

function rowToLocation(row: LocationRow) {
  return { id: row.id, name: row.name, price: row.price, isActive: row.is_active };
}

interface CreateBody {
  name?: string;
  price?: number;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === "GET") {
    const wantsAll = req.query.all === "1" && isAdminRequest(req);
    const { rows } = await query(
      wantsAll
        ? `select * from delivery_locations order by sort_order, created_at`
        : `select * from delivery_locations where is_active = true order by sort_order, created_at`
    );
    return res.status(200).json({ locations: (rows as LocationRow[]).map(rowToLocation) });
  }

  if (req.method === "POST") {
    if (!requireAdmin(req, res)) return;

    const body = (req.body || {}) as CreateBody;
    const { name, price } = body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: "name es requerido" });
    }
    if (typeof price !== "number" || !Number.isFinite(price) || price < 0) {
      return res.status(400).json({ error: "price debe ser un número válido" });
    }

    const id = crypto.randomUUID();
    const { rows: orderRows } = await query(`select coalesce(max(sort_order), -1) + 1 as next from delivery_locations`);
    const sortOrder = orderRows[0].next;

    const { rows } = await query(
      `insert into delivery_locations (id, name, price, sort_order) values ($1, $2, $3, $4) returning *`,
      [id, name.trim(), Math.round(price), sortOrder]
    );

    return res.status(201).json({ location: rows[0] });
  }

  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({ error: "Método no permitido" });
}
