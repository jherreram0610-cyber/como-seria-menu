import type { VercelRequest, VercelResponse } from "@vercel/node";
import { query } from "../_lib/db.js";
import { requireAdmin } from "../_lib/auth.js";

interface UpdateBody {
  name?: string;
  price?: number;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!requireAdmin(req, res)) return;

  const { id } = req.query;
  if (!id || typeof id !== "string") {
    return res.status(400).json({ error: "id es requerido" });
  }

  if (req.method === "PUT") {
    const body = (req.body || {}) as UpdateBody;
    const sets: string[] = [];
    const values: unknown[] = [];

    if (typeof body.name === "string") {
      values.push(body.name.trim());
      sets.push(`name = $${values.length}`);
    }
    if (typeof body.price === "number") {
      values.push(Math.round(body.price));
      sets.push(`price = $${values.length}`);
    }

    if (sets.length === 0) {
      return res.status(400).json({ error: "No hay campos para actualizar" });
    }

    values.push(id);
    const { rows } = await query(
      `update delivery_locations set ${sets.join(", ")}, updated_at = now() where id = $${values.length} returning *`,
      values
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: "Zona no encontrada" });
    }
    return res.status(200).json({ location: rows[0] });
  }

  if (req.method === "PATCH") {
    const { isActive } = (req.body || {}) as { isActive?: boolean };
    if (typeof isActive !== "boolean") {
      return res.status(400).json({ error: "isActive (boolean) es requerido" });
    }
    const { rows } = await query(
      `update delivery_locations set is_active = $1, updated_at = now() where id = $2 returning *`,
      [isActive, id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: "Zona no encontrada" });
    }
    return res.status(200).json({ location: rows[0] });
  }

  res.setHeader("Allow", "PUT, PATCH");
  return res.status(405).json({ error: "Método no permitido" });
}
