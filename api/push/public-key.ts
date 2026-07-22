import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireAdmin } from "../_lib/auth.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Método no permitido" });
  }
  if (!requireAdmin(req, res)) return;

  return res.status(200).json({ publicKey: process.env.VAPID_PUBLIC_KEY || null });
}
