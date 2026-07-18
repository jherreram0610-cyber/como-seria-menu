import type { VercelRequest, VercelResponse } from "@vercel/node";
import { query } from "./_lib/db.js";

// Colombia no tiene horario de verano, así que el offset de Bogotá (UTC-5) es fijo.
const BOGOTA_OFFSET_MS = 5 * 60 * 60 * 1000;

// Rango [lunes 00:00, siguiente lunes 00:00) de la semana actual, en hora de Bogotá,
// expresado como instantes UTC listos para comparar contra created_at (timestamptz).
function currentWeekRangeUtc() {
  const bogotaNow = new Date(Date.now() - BOGOTA_OFFSET_MS);
  const day = bogotaNow.getUTCDay(); // 0 = domingo
  const diffToMonday = (day + 6) % 7; // lunes = 0
  const bogotaMonday = new Date(Date.UTC(
    bogotaNow.getUTCFullYear(),
    bogotaNow.getUTCMonth(),
    bogotaNow.getUTCDate() - diffToMonday
  ));
  const from = new Date(bogotaMonday.getTime() + BOGOTA_OFFSET_MS);
  const to = new Date(from.getTime() + 7 * 24 * 60 * 60 * 1000);
  return { from, to };
}

interface OrderItem {
  id?: string;
  qty?: number;
  totalPrice?: number;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Método no permitido" });
  }

  const { from, to } = currentWeekRangeUtc();
  const { rows } = await query(
    `select items from orders where is_deleted = false and created_at >= $1 and created_at < $2`,
    [from.toISOString(), to.toISOString()]
  );

  const ranking = new Map<string, { id: string; qty: number; total: number }>();
  for (const row of rows as { items: OrderItem[] }[]) {
    const items = Array.isArray(row.items) ? row.items : [];
    for (const item of items) {
      if (!item?.id) continue;
      const entry = ranking.get(item.id) || { id: item.id, qty: 0, total: 0 };
      entry.qty += item.qty || 1;
      entry.total += (item.totalPrice || 0) * (item.qty || 1);
      ranking.set(item.id, entry);
    }
  }

  const top = [...ranking.values()]
    .sort((a, b) => b.qty - a.qty || b.total - a.total)
    .slice(0, 3)
    .map((entry, i) => ({ id: entry.id, rank: i + 1 }));

  return res.status(200).json({ top });
}
