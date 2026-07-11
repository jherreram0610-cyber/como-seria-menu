import type { VercelRequest, VercelResponse } from "@vercel/node";
import { checkPassword, setAdminCookie } from "../_lib/auth";

export default function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Método no permitido" });
  }

  const { password } = (req.body || {}) as { password?: string };
  if (!password) {
    return res.status(400).json({ error: "password es requerido" });
  }

  if (!checkPassword(password)) {
    return res.status(401).json({ error: "Contraseña incorrecta" });
  }

  setAdminCookie(res);
  return res.status(200).json({ ok: true });
}
