import type { VercelRequest, VercelResponse } from "@vercel/node";
import { query } from "./_lib/db.js";
import { requireAdmin } from "./_lib/auth.js";
import { loadStoreSettings, rowToSettings } from "./_lib/storeSettings.js";
import { getStoreStatus, validateDayHours, validateSpecialDay } from "./_lib/storeHours.js";

interface UpdateBody {
  weeklyHours?: unknown;
  holidayHours?: unknown;
  specialDays?: unknown;
  ordersPaused?: unknown;
  pauseMessage?: unknown;
  pauseUntil?: unknown;
  paymentNotice?: unknown;
}

// GET (público): horario, pausa y aviso de pago, más el estado calculado en el
// servidor y su hora — el menú usa serverNow para corregir el reloj del
// celular del cliente si está desfasado.
//
// PUT (admin): actualiza cualquier subconjunto de campos.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === "GET") {
    const settings = await loadStoreSettings();
    if (!settings) return res.status(200).json({ settings: null, status: null, serverNow: new Date().toISOString() });
    const now = new Date();
    return res.status(200).json({ settings, status: getStoreStatus(settings, now), serverNow: now.toISOString() });
  }

  if (req.method === "PUT") {
    if (!requireAdmin(req, res)) return;
    const body = (req.body || {}) as UpdateBody;
    const sets: string[] = [];
    const values: unknown[] = [];
    const push = (column: string, value: unknown) => {
      values.push(value);
      sets.push(`${column} = $${values.length}`);
    };

    if (body.weeklyHours !== undefined) {
      if (!Array.isArray(body.weeklyHours) || body.weeklyHours.length !== 7 || !body.weeklyHours.every(validateDayHours)) {
        return res.status(400).json({ error: "weeklyHours debe tener 7 días con { isOpen, from, to } (HH:MM)" });
      }
      push("weekly_hours", JSON.stringify(body.weeklyHours));
    }
    if (body.holidayHours !== undefined) {
      if (body.holidayHours !== null && !validateDayHours(body.holidayHours)) {
        return res.status(400).json({ error: "holidayHours debe ser null o { isOpen, from, to }" });
      }
      push("holiday_hours", body.holidayHours === null ? null : JSON.stringify(body.holidayHours));
    }
    if (body.specialDays !== undefined) {
      if (!Array.isArray(body.specialDays) || !body.specialDays.every(validateSpecialDay)) {
        return res.status(400).json({ error: "specialDays debe ser una lista de { date, isOpen, from, to, note? }" });
      }
      const dates = body.specialDays.map((d) => d.date);
      if (new Set(dates).size !== dates.length) {
        return res.status(400).json({ error: "Hay dos fechas especiales con el mismo día" });
      }
      push("special_days", JSON.stringify(body.specialDays));
    }
    if (body.ordersPaused !== undefined) {
      if (typeof body.ordersPaused !== "boolean") return res.status(400).json({ error: "ordersPaused debe ser boolean" });
      push("orders_paused", body.ordersPaused);
    }
    if (body.pauseMessage !== undefined) {
      if (body.pauseMessage !== null && typeof body.pauseMessage !== "string") {
        return res.status(400).json({ error: "pauseMessage debe ser texto" });
      }
      push("pause_message", typeof body.pauseMessage === "string" ? body.pauseMessage.trim().slice(0, 300) || null : null);
    }
    if (body.pauseUntil !== undefined) {
      if (body.pauseUntil !== null && (typeof body.pauseUntil !== "string" || Number.isNaN(Date.parse(body.pauseUntil)))) {
        return res.status(400).json({ error: "pauseUntil debe ser una fecha ISO o null" });
      }
      push("pause_until", body.pauseUntil);
    }
    if (body.paymentNotice !== undefined) {
      if (body.paymentNotice !== null && typeof body.paymentNotice !== "string") {
        return res.status(400).json({ error: "paymentNotice debe ser texto" });
      }
      push("payment_notice", typeof body.paymentNotice === "string" ? body.paymentNotice.trim().slice(0, 500) || null : null);
    }

    if (sets.length === 0) return res.status(400).json({ error: "No hay campos para actualizar" });

    const { rows } = await query(
      `update store_settings set ${sets.join(", ")}, updated_at = now() where id = 'singleton' returning *`,
      values
    );
    if (rows.length === 0) return res.status(404).json({ error: "Falta configurar el horario (migración pendiente)" });
    const settings = rowToSettings(rows[0]);
    const now = new Date();
    return res.status(200).json({ settings, status: getStoreStatus(settings, now), serverNow: now.toISOString() });
  }

  res.setHeader("Allow", "GET, PUT");
  return res.status(405).json({ error: "Método no permitido" });
}
