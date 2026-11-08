import type { VercelRequest, VercelResponse } from "@vercel/node";
import { query } from "../_lib/db.js";
import { requireAdmin, verifyPasswordHash } from "../_lib/auth.js";
import { rowToComboOption, type ComboOptionRow } from "../_lib/comboOptions.js";

interface UpdateBody {
  name?: string;
  price?: number;
  sortOrder?: number;
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
      if (!body.name.trim()) return res.status(400).json({ error: "El nombre no puede quedar vacío" });
      values.push(body.name.trim());
      sets.push(`name = $${values.length}`);
    }
    if (body.price !== undefined) {
      if (typeof body.price !== "number" || !Number.isFinite(body.price) || body.price < 0) {
        return res.status(400).json({ error: "price debe ser un número válido" });
      }
      values.push(Math.round(body.price));
      sets.push(`price = $${values.length}`);
    }
    if (typeof body.sortOrder === "number") {
      values.push(Math.round(body.sortOrder));
      sets.push(`sort_order = $${values.length}`);
    }
    if (sets.length === 0) {
      return res.status(400).json({ error: "No hay campos para actualizar" });
    }

    values.push(id);
    const { rows } = await query(
      `update combo_options set ${sets.join(", ")}, updated_at = now() where id = $${values.length} and is_deleted = false returning *`,
      values
    );
    if (rows.length === 0) return res.status(404).json({ error: "Opción no encontrada" });
    return res.status(200).json({ comboOption: rowToComboOption(rows[0] as ComboOptionRow) });
  }

  if (req.method === "PATCH") {
    const { isActive } = (req.body || {}) as { isActive?: boolean };
    if (typeof isActive !== "boolean") {
      return res.status(400).json({ error: "isActive (boolean) es requerido" });
    }
    const { rows } = await query(
      `update combo_options set is_active = $1, updated_at = now() where id = $2 and is_deleted = false returning *`,
      [isActive, id]
    );
    if (rows.length === 0) return res.status(404).json({ error: "Opción no encontrada" });
    return res.status(200).json({ comboOption: rowToComboOption(rows[0] as ComboOptionRow) });
  }

  if (req.method === "DELETE") {
    const { pin } = (req.body || {}) as { pin?: string };
    if (!pin) return res.status(400).json({ error: "Falta el PIN de eliminación" });

    const { rows: settingsRows } = await query(`select delete_pin_hash from admin_settings where id = 'singleton'`);
    const storedHash = settingsRows[0]?.delete_pin_hash;
    if (!storedHash) {
      return res.status(400).json({ error: "Todavía no se ha configurado un PIN de eliminación" });
    }
    if (!verifyPasswordHash(pin, storedHash)) {
      return res.status(401).json({ error: "PIN incorrecto" });
    }

    // Nunca se borra el registro (DELETE FROM): solo se marca como eliminado.
    const { rowCount } = await query(`update combo_options set is_deleted = true where id = $1`, [id]);
    if (rowCount === 0) return res.status(404).json({ error: "Opción no encontrada" });
    return res.status(200).json({ ok: true });
  }

  res.setHeader("Allow", "PUT, PATCH, DELETE");
  return res.status(405).json({ error: "Método no permitido" });
}
