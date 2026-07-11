import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireAdmin, hashPassword, verifyPasswordHash } from "../_lib/auth.js";
import { query } from "../_lib/db.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Método no permitido" });
  }
  if (!requireAdmin(req, res)) return;

  const { currentPassword, newPassword } = (req.body || {}) as { currentPassword?: string; newPassword?: string };
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: "currentPassword y newPassword son requeridos" });
  }
  if (newPassword.length < 6) {
    return res.status(400).json({ error: "La nueva contraseña debe tener al menos 6 caracteres" });
  }

  const { rows } = await query(`select password_hash from admin_settings where id = 'singleton'`);
  const storedHash = rows[0]?.password_hash;
  if (!storedHash || !verifyPasswordHash(currentPassword, storedHash)) {
    return res.status(401).json({ error: "La contraseña actual no es correcta" });
  }

  const newHash = hashPassword(newPassword);
  await query(
    `insert into admin_settings (id, password_hash) values ('singleton', $1)
     on conflict (id) do update set password_hash = excluded.password_hash, updated_at = now()`,
    [newHash]
  );

  return res.status(200).json({ ok: true });
}
