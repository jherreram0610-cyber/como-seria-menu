import type { VercelRequest, VercelResponse } from "@vercel/node";
import { query } from "../_lib/db.js";
import { requireAdmin, verifyPasswordHash } from "../_lib/auth.js";

interface Account {
  label: string;
  value: string;
}

interface UpdateBody {
  label?: string;
  accounts?: Account[];
  sortOrder?: number;
}

function validateAccounts(accounts: unknown): accounts is Account[] {
  return (
    Array.isArray(accounts) &&
    accounts.every(
      (a) => a && typeof a === "object" && typeof (a as Account).label === "string" && typeof (a as Account).value === "string"
    )
  );
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

    if (typeof body.label === "string") {
      if (!body.label.trim()) {
        return res.status(400).json({ error: "label no puede quedar vacío" });
      }
      values.push(body.label.trim());
      sets.push(`label = $${values.length}`);
    }
    if (body.accounts !== undefined) {
      if (!validateAccounts(body.accounts)) {
        return res.status(400).json({ error: "accounts debe ser una lista de { label, value }" });
      }
      values.push(JSON.stringify(body.accounts));
      sets.push(`accounts = $${values.length}`);
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
      `update payment_methods set ${sets.join(", ")}, updated_at = now() where id = $${values.length} returning *`,
      values
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: "Método de pago no encontrado" });
    }
    return res.status(200).json({ paymentMethod: rows[0] });
  }

  if (req.method === "PATCH") {
    const { isActive } = (req.body || {}) as { isActive?: boolean };
    if (typeof isActive !== "boolean") {
      return res.status(400).json({ error: "isActive (boolean) es requerido" });
    }
    const { rows } = await query(
      `update payment_methods set is_active = $1, updated_at = now() where id = $2 returning *`,
      [isActive, id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: "Método de pago no encontrado" });
    }
    return res.status(200).json({ paymentMethod: rows[0] });
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
    const { rowCount } = await query(`update payment_methods set is_deleted = true where id = $1`, [id]);
    if (rowCount === 0) return res.status(404).json({ error: "Método de pago no encontrado" });
    return res.status(200).json({ ok: true });
  }

  res.setHeader("Allow", "PUT, PATCH, DELETE");
  return res.status(405).json({ error: "Método no permitido" });
}
