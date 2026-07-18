import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireAdmin, hashPassword, verifyPasswordHash } from "../_lib/auth.js";
import { query } from "../_lib/db.js";

const PIN_REGEX = /^\d{4}$/;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Método no permitido" });
  }
  if (!requireAdmin(req, res)) return;

  const { currentPin, newPin } = (req.body || {}) as { currentPin?: string; newPin?: string };
  if (!currentPin || !newPin) {
    return res.status(400).json({ error: "currentPin y newPin son requeridos" });
  }
  if (!PIN_REGEX.test(newPin)) {
    return res.status(400).json({ error: "El nuevo PIN debe tener exactamente 4 dígitos" });
  }

  const { rows } = await query(`select delete_pin_hash from admin_settings where id = 'singleton'`);
  const storedHash = rows[0]?.delete_pin_hash;
  if (!storedHash) {
    return res.status(400).json({
      error: "Todavía no se ha configurado un PIN de eliminación en el servidor (contacta soporte técnico)",
    });
  }
  if (!verifyPasswordHash(currentPin, storedHash)) {
    return res.status(401).json({ error: "El PIN actual no es correcto" });
  }

  const newHash = hashPassword(newPin);
  await query(
    `update admin_settings set delete_pin_hash = $1, updated_at = now() where id = 'singleton'`,
    [newHash]
  );

  return res.status(200).json({ ok: true });
}
