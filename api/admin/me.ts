import type { VercelRequest, VercelResponse } from "@vercel/node";
import { isAdminRequest } from "../_lib/auth.ts";

export default function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Método no permitido" });
  }
  return res.status(200).json({ authenticated: isAdminRequest(req) });
}
