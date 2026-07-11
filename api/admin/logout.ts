import type { VercelRequest, VercelResponse } from "@vercel/node";
import { clearAdminCookie } from "../_lib/auth";

export default function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Método no permitido" });
  }
  clearAdminCookie(res);
  return res.status(200).json({ ok: true });
}
