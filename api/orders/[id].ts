import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireAdmin, verifyPasswordHash } from "../_lib/auth.js";
import { query } from "../_lib/db.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "DELETE") {
    res.setHeader("Allow", "DELETE");
    return res.status(405).json({ error: "Método no permitido" });
  }
  if (!requireAdmin(req, res)) return;

  const { id } = req.query as { id?: string };
  const { pin } = (req.body || {}) as { pin?: string };
  if (!id) return res.status(400).json({ error: "Falta el id del pedido" });
  if (!pin) return res.status(400).json({ error: "Falta el PIN de eliminación" });

  const { rows } = await query(`select delete_pin_hash from admin_settings where id = 'singleton'`);
  const storedHash = rows[0]?.delete_pin_hash;
  if (!storedHash) {
    return res.status(400).json({ error: "Todavía no se ha configurado un PIN de eliminación" });
  }
  if (!verifyPasswordHash(pin, storedHash)) {
    return res.status(401).json({ error: "PIN incorrecto" });
  }

  // Nunca se borra el registro (DELETE FROM): solo se marca como eliminado,
  // así el pedido desaparece del panel pero el historial se conserva.
  const { rowCount } = await query(`update orders set is_deleted = true where id = $1`, [id]);
  if (rowCount === 0) return res.status(404).json({ error: "Pedido no encontrado" });

  return res.status(200).json({ ok: true });
}
