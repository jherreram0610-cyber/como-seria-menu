import type { VercelRequest, VercelResponse } from "@vercel/node";
import { verifyPasswordHash, setAdminCookie } from "../_lib/auth.js";
import { query } from "../_lib/db.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Método no permitido" });
  }

  const { password } = (req.body || {}) as { password?: string };
  if (!password) {
    return res.status(400).json({ error: "password es requerido" });
  }

  const { rows } = await query(`select password_hash from admin_settings where id = 'singleton'`);
  const storedHash = rows[0]?.password_hash;

  if (!storedHash || !verifyPasswordHash(password, storedHash)) {
    return res.status(401).json({ error: "Contraseña incorrecta" });
  }

  setAdminCookie(res);
  return res.status(200).json({ ok: true });
}
