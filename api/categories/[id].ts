import type { VercelRequest, VercelResponse } from "@vercel/node";
import { query } from "../_lib/db.js";
import { requireAdmin, verifyPasswordHash } from "../_lib/auth.js";

interface UpdateBody {
  label?: string;
  icon?: string;
  sortOrder?: number;
}

// Las 5 categorías originales (sembradas en db/schema.sql) sostienen lógica de
// negocio específica (combos, adiciones/bebidas de agregado rápido, bebida por
// defecto de los combos) — se pueden renombrar/reordenar/desactivar, pero no
// eliminar, para no romper el flujo de pedidos.
const BUILTIN_CATEGORY_IDS = ["hamburguesas", "tenders", "combos", "adiciones", "bebidas"];

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

    if (typeof body.label === "string") {
      values.push(body.label.trim());
      sets.push(`label = $${values.length}`);
    }
    if (typeof body.icon === "string") {
      values.push(body.icon.trim() || "🍽️");
      sets.push(`icon = $${values.length}`);
    }
    if (typeof body.sortOrder === "number") {
      values.push(body.sortOrder);
      sets.push(`sort_order = $${values.length}`);
    }

    if (sets.length === 0) {
      return res.status(400).json({ error: "No hay campos para actualizar" });
    }

    values.push(id);
    const { rows } = await query(
      `update categories set ${sets.join(", ")}, updated_at = now() where id = $${values.length} returning *`,
      values
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: "Categoría no encontrada" });
    }
    return res.status(200).json({ category: rows[0] });
  }

  if (req.method === "PATCH") {
    const { isActive } = (req.body || {}) as { isActive?: boolean };
    if (typeof isActive !== "boolean") {
      return res.status(400).json({ error: "isActive (boolean) es requerido" });
    }
    const { rows } = await query(
      `update categories set is_active = $1, updated_at = now() where id = $2 returning *`,
      [isActive, id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: "Categoría no encontrada" });
    }
    return res.status(200).json({ category: rows[0] });
  }

  if (req.method === "DELETE") {
    if (BUILTIN_CATEGORY_IDS.includes(id)) {
      return res.status(400).json({
        error: "Esta categoría es parte del sistema y no se puede eliminar, pero sí puedes desactivarla",
      });
    }

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

    const { rows: itemRows } = await query(
      `select 1 from menu_items where category = $1 and is_deleted = false limit 1`,
      [id]
    );
    if (itemRows.length > 0) {
      return res.status(400).json({ error: "Esta categoría todavía tiene productos. Elimínalos o muévelos primero." });
    }

    // Nunca se borra el registro (DELETE FROM): solo se marca como eliminado.
    const { rowCount } = await query(`update categories set is_deleted = true where id = $1`, [id]);
    if (rowCount === 0) return res.status(404).json({ error: "Categoría no encontrada" });
    return res.status(200).json({ ok: true });
  }

  res.setHeader("Allow", "PUT, PATCH, DELETE");
  return res.status(405).json({ error: "Método no permitido" });
}
