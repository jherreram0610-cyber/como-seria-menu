import type { VercelRequest, VercelResponse } from "@vercel/node";
import { query } from "../_lib/db.js";
import { requireAdmin } from "../_lib/auth.js";

interface SubscribeBody {
  endpoint?: string;
  keys?: { p256dh?: string; auth?: string };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Método no permitido" });
  }
  if (!requireAdmin(req, res)) return;

  const body = (req.body || {}) as SubscribeBody;
  const { endpoint, keys } = body;
  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    return res.status(400).json({ error: "Suscripción de push inválida" });
  }

  await query(
    `insert into push_subscriptions (endpoint, p256dh, auth)
     values ($1, $2, $3)
     on conflict (endpoint) do update set p256dh = excluded.p256dh, auth = excluded.auth`,
    [endpoint, keys.p256dh, keys.auth]
  );

  return res.status(201).json({ ok: true });
}
