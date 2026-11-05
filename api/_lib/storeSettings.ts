import { query } from "./db.js";
import type { StoreSettings } from "./storeHours.js";

interface StoreSettingsRow {
  weekly_hours: StoreSettings["weeklyHours"];
  holiday_hours: StoreSettings["holidayHours"];
  special_days: StoreSettings["specialDays"];
  orders_paused: boolean;
  pause_message: string | null;
  pause_until: Date | string | null;
  payment_notice: string | null;
}

export function rowToSettings(row: StoreSettingsRow): StoreSettings {
  const until = row.pause_until;
  return {
    weeklyHours: row.weekly_hours,
    holidayHours: row.holiday_hours ?? null,
    specialDays: Array.isArray(row.special_days) ? row.special_days : [],
    ordersPaused: !!row.orders_paused,
    pauseMessage: row.pause_message,
    pauseUntil: until ? new Date(until).toISOString() : null,
    paymentNotice: row.payment_notice,
  };
}

// null si la tabla todavía no existe o está vacía (ej. código nuevo corriendo
// contra una base sin migrar). Quien llama decide qué hacer en ese caso.
export async function loadStoreSettings(): Promise<StoreSettings | null> {
  const { rows } = await query(`select * from store_settings where id = 'singleton'`);
  return rows[0] ? rowToSettings(rows[0] as StoreSettingsRow) : null;
}
