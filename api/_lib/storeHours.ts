// Horario de atención y pausa de pedidos.
//
// Este archivo NO depende de nada de Node: lo usan tanto el backend (para
// rechazar pedidos fuera de horario en /api/orders) como el frontend (para
// mostrar "cerrado" y desactivar el botón de WhatsApp). Así las dos partes
// deciden con exactamente la misma regla.
//
// Todo se calcula en hora de Bogotá. Colombia no tiene horario de verano, así
// que el offset (UTC-5) es fijo — mismo criterio que api/top-products.ts.

const BOGOTA_OFFSET_MS = 5 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface DayHours {
  isOpen: boolean;
  from: string; // "HH:MM" (24 h)
  to: string; // "HH:MM" (24 h). Si es <= from, el turno termina al día siguiente.
}

export interface SpecialDay extends DayHours {
  date: string; // "YYYY-MM-DD"
  note?: string;
}

export interface StoreSettings {
  weeklyHours: DayHours[]; // 7 entradas, índice 0 = domingo (como Date.getDay())
  holidayHours: DayHours | null; // null = los festivos siguen el horario de su día
  specialDays: SpecialDay[];
  ordersPaused: boolean;
  pauseMessage: string | null;
  pauseUntil: string | null; // ISO; null = pausado hasta que el admin lo reactive
  paymentNotice: string | null;
}

export const DAY_NAMES = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const DAY_SHORT = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];

export const DEFAULT_PAYMENT_NOTICE =
  "Espera nuestra confirmación por WhatsApp antes de pagar. Así evitamos devoluciones si no podemos atender tu pedido.";
export const DEFAULT_PAUSE_MESSAGE = "Hoy no estamos recibiendo pedidos. ¡Te esperamos pronto!";

// ─── Fechas en hora de Bogotá ────────────────────────────────────────────────

export interface BogotaParts {
  dateKey: string; // "YYYY-MM-DD"
  weekday: number; // 0 = domingo
  minutes: number; // minutos desde medianoche
}

const pad = (n: number) => String(n).padStart(2, "0");

export function bogotaParts(date: Date): BogotaParts {
  const b = new Date(date.getTime() - BOGOTA_OFFSET_MS);
  return {
    dateKey: `${b.getUTCFullYear()}-${pad(b.getUTCMonth() + 1)}-${pad(b.getUTCDate())}`,
    weekday: b.getUTCDay(),
    minutes: b.getUTCHours() * 60 + b.getUTCMinutes(),
  };
}

// Medianoche (00:00 Bogotá) del día siguiente a `date`, como instante real.
export function nextBogotaMidnight(date: Date): Date {
  const b = new Date(date.getTime() - BOGOTA_OFFSET_MS);
  const midnightUtc = Date.UTC(b.getUTCFullYear(), b.getUTCMonth(), b.getUTCDate() + 1);
  return new Date(midnightUtc + BOGOTA_OFFSET_MS);
}

function shiftDateKey(dateKey: string, days: number): { dateKey: string; weekday: number } {
  const [y, m, d] = dateKey.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return {
    dateKey: `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`,
    weekday: dt.getUTCDay(),
  };
}

export function toMinutes(hhmm: string): number {
  const [h, m] = String(hhmm || "").split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return NaN;
  return h * 60 + m;
}

export function isValidTime(hhmm: unknown): hhmm is string {
  if (typeof hhmm !== "string" || !/^\d{2}:\d{2}$/.test(hhmm)) return false;
  const [h, m] = hhmm.split(":").map(Number);
  return h >= 0 && h <= 23 && m >= 0 && m <= 59;
}

// "17:30" → "5:30pm", "12:00" → "12:00m", "00:00" → "12:00am"
export function formatTime12(hhmm: string): string {
  const total = toMinutes(hhmm);
  if (!Number.isFinite(total)) return hhmm;
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 12 && m === 0) return "12:00m";
  const suffix = h < 12 ? "am" : "pm";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${pad(m)}${suffix}`;
}

// ─── Festivos de Colombia ────────────────────────────────────────────────────
// Ley 51 de 1983 ("Ley Emiliani"): varios festivos se trasladan al lunes
// siguiente. Los que dependen de la Pascua se calculan con el algoritmo de
// Meeus/Jones/Butcher.

function easterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day));
}

const keyOf = (dt: Date) => `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
const addDays = (dt: Date, n: number) => new Date(dt.getTime() + n * DAY_MS);
const toMonday = (dt: Date) => {
  const wd = dt.getUTCDay();
  return wd === 1 ? dt : addDays(dt, (8 - wd) % 7);
};

const holidayCache = new Map<number, Map<string, string>>();

export function colombianHolidays(year: number): Map<string, string> {
  const cached = holidayCache.get(year);
  if (cached) return cached;

  const out = new Map<string, string>();
  const fixed = (m: number, d: number, name: string) => out.set(keyOf(new Date(Date.UTC(year, m - 1, d))), name);
  const moved = (dt: Date, name: string) => out.set(keyOf(toMonday(dt)), name);
  const ymd = (m: number, d: number) => new Date(Date.UTC(year, m - 1, d));

  fixed(1, 1, "Año Nuevo");
  fixed(5, 1, "Día del Trabajo");
  fixed(7, 20, "Independencia");
  fixed(8, 7, "Batalla de Boyacá");
  fixed(12, 8, "Inmaculada Concepción");
  fixed(12, 25, "Navidad");

  moved(ymd(1, 6), "Reyes Magos");
  moved(ymd(3, 19), "San José");
  moved(ymd(6, 29), "San Pedro y San Pablo");
  moved(ymd(8, 15), "Asunción de la Virgen");
  moved(ymd(10, 12), "Día de la Raza");
  moved(ymd(11, 1), "Todos los Santos");
  moved(ymd(11, 11), "Independencia de Cartagena");

  const easter = easterSunday(year);
  out.set(keyOf(addDays(easter, -3)), "Jueves Santo");
  out.set(keyOf(addDays(easter, -2)), "Viernes Santo");
  moved(addDays(easter, 39), "Ascensión del Señor");
  moved(addDays(easter, 60), "Corpus Christi");
  moved(addDays(easter, 68), "Sagrado Corazón");

  holidayCache.set(year, out);
  return out;
}

export function holidayName(dateKey: string): string | null {
  const year = Number(dateKey.slice(0, 4));
  return colombianHolidays(year).get(dateKey) || null;
}

// ─── Horario de un día ───────────────────────────────────────────────────────

export interface DaySchedule extends DayHours {
  source: "special" | "holiday" | "weekly";
  note: string | null;
}

// Prioridad: fecha especial > festivo (si tiene horario propio) > día de la semana.
export function scheduleFor(settings: StoreSettings, dateKey: string, weekday: number): DaySchedule {
  const special = settings.specialDays.find((s) => s.date === dateKey);
  if (special) {
    return { isOpen: special.isOpen, from: special.from, to: special.to, source: "special", note: special.note || null };
  }
  const holiday = holidayName(dateKey);
  if (holiday && settings.holidayHours) {
    return { ...settings.holidayHours, source: "holiday", note: holiday };
  }
  const weekly = settings.weeklyHours[weekday] || { isOpen: false, from: "00:00", to: "00:00" };
  return { ...weekly, source: "weekly", note: null };
}

function crossesMidnight(day: DayHours) {
  return toMinutes(day.to) <= toMinutes(day.from);
}

// ─── Estado actual ───────────────────────────────────────────────────────────

export interface StoreStatus {
  isOpen: boolean;
  reason: "open" | "paused" | "closed";
  // Texto listo para mostrarle al cliente.
  title: string;
  detail: string;
  closesAt: string | null; // "HH:MM" cuando está abierto
}

interface NextOpening {
  dateKey: string;
  weekday: number;
  from: string;
  daysAhead: number;
}

function findNextOpening(settings: StoreSettings, today: BogotaParts): NextOpening | null {
  for (let i = 0; i <= 14; i++) {
    const { dateKey, weekday } = shiftDateKey(today.dateKey, i);
    const day = scheduleFor(settings, dateKey, weekday);
    if (!day.isOpen) continue;
    if (i === 0 && toMinutes(day.from) <= today.minutes) continue; // ya pasó la apertura de hoy
    return { dateKey, weekday, from: day.from, daysAhead: i };
  }
  return null;
}

function describeOpening(next: NextOpening | null): string {
  if (!next) return "Por ahora no tenemos un horario de apertura programado.";
  const when =
    next.daysAhead === 0 ? "hoy" : next.daysAhead === 1 ? "mañana" : `el ${DAY_NAMES[next.weekday]}`;
  return `Abrimos ${when} a las ${formatTime12(next.from)}.`;
}

export function isPauseActive(settings: StoreSettings, now: Date): boolean {
  if (!settings.ordersPaused) return false;
  if (!settings.pauseUntil) return true;
  const until = new Date(settings.pauseUntil).getTime();
  return !Number.isFinite(until) || now.getTime() < until;
}

export function getStoreStatus(settings: StoreSettings, now: Date): StoreStatus {
  const today = bogotaParts(now);

  if (isPauseActive(settings, now)) {
    return {
      isOpen: false,
      reason: "paused",
      title: "No estamos recibiendo pedidos",
      detail: (settings.pauseMessage || "").trim() || DEFAULT_PAUSE_MESSAGE,
      closesAt: null,
    };
  }

  // ¿Estamos dentro del turno de hoy?
  const day = scheduleFor(settings, today.dateKey, today.weekday);
  if (day.isOpen) {
    const from = toMinutes(day.from);
    const to = toMinutes(day.to);
    const inside = crossesMidnight(day) ? today.minutes >= from : today.minutes >= from && today.minutes < to;
    if (inside) {
      return { isOpen: true, reason: "open", title: "Abierto ahora", detail: `Recibimos pedidos hasta las ${formatTime12(day.to)}.`, closesAt: day.to };
    }
  }

  // ¿O dentro de la parte de madrugada de un turno de ayer que cruza la medianoche?
  const yesterdayKey = shiftDateKey(today.dateKey, -1);
  const yesterday = scheduleFor(settings, yesterdayKey.dateKey, yesterdayKey.weekday);
  if (yesterday.isOpen && crossesMidnight(yesterday) && today.minutes < toMinutes(yesterday.to)) {
    return { isOpen: true, reason: "open", title: "Abierto ahora", detail: `Recibimos pedidos hasta las ${formatTime12(yesterday.to)}.`, closesAt: yesterday.to };
  }

  const next = findNextOpening(settings, today);
  const closedToday = !day.isOpen;
  const reasonNote = closedToday && day.note ? ` (${day.note})` : "";
  return {
    isOpen: false,
    reason: "closed",
    title: closedToday ? `Hoy no atendemos${reasonNote}` : "Estamos cerrados en este momento",
    detail: describeOpening(next),
    closesAt: null,
  };
}

// ─── Resumen del horario para el encabezado del menú ────────────────────────
// Agrupa días consecutivos con el mismo horario: "mar-jue 5:30pm - 9:30pm".
// Si los festivos tienen horario propio y coincide con algún grupo, se le
// agrega "y festivos" a ese grupo, igual que el texto que estaba fijo antes.

export function formatScheduleSummary(settings: StoreSettings): string {
  // Orden de lunes a domingo, que es como se lee un horario en Colombia.
  const order = [1, 2, 3, 4, 5, 6, 0];
  const sig = (d: DayHours) => (d.isOpen ? `${d.from}-${d.to}` : "closed");

  const groups: { days: number[]; hours: DayHours }[] = [];
  for (const wd of order) {
    const hours = settings.weeklyHours[wd];
    if (!hours) continue;
    const last = groups[groups.length - 1];
    if (last && sig(last.hours) === sig(hours)) last.days.push(wd);
    else groups.push({ days: [wd], hours });
  }

  const holiday = settings.holidayHours;
  let holidayAttached = !holiday || !holiday.isOpen;
  const parts = groups
    .filter((g) => g.hours.isOpen)
    .map((g) => {
      const first = DAY_SHORT[g.days[0]];
      const last = DAY_SHORT[g.days[g.days.length - 1]];
      let label = g.days.length === 1 ? first : g.days.length === 2 ? `${first} y ${last}` : `${first}-${last}`;
      if (!holidayAttached && holiday && sig(holiday) === sig(g.hours)) {
        label += " y festivos";
        holidayAttached = true;
      }
      return `${label} ${formatTime12(g.hours.from)} - ${formatTime12(g.hours.to)}`;
    });

  if (!holidayAttached && holiday) {
    parts.push(`festivos ${formatTime12(holiday.from)} - ${formatTime12(holiday.to)}`);
  }
  return parts.length ? parts.join(" | ") : "Sin horario configurado";
}

// ─── Normalización de lo que llega de la base de datos / del cliente ────────

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object";

export function validateDayHours(value: unknown): value is DayHours {
  return isObj(value) && typeof value.isOpen === "boolean" && isValidTime(value.from) && isValidTime(value.to);
}

export function validateSpecialDay(value: unknown): value is SpecialDay {
  return (
    validateDayHours(value) &&
    typeof (value as unknown as SpecialDay).date === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test((value as unknown as SpecialDay).date) &&
    ((value as unknown as SpecialDay).note === undefined || typeof (value as unknown as SpecialDay).note === "string")
  );
}
