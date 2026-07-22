// Se importa el archivo real en vez de "web-push" a secas: ese paquete no
// tiene un campo "exports" en su package.json, y eso hace que la resolución
// de módulos ESM falle en ciertos entornos de bundling (ej. el servidor de
// desarrollo local) aunque funcione con Node directamente.
import webpush from "web-push/src/index.js";
import { query } from "./db.js";

let configured = false;

function ensureConfigured(): boolean {
  const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT } = process.env;
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY || !VAPID_SUBJECT) return false;
  if (!configured) {
    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
    configured = true;
  }
  return true;
}

interface SubscriptionRow {
  endpoint: string;
  p256dh: string;
  auth: string;
}

// Le avisa a todos los dispositivos suscritos que llegó un pedido nuevo. No
// depende de que el admin tenga la pestaña abierta (a diferencia del sonido/
// banner, que sí). Si faltan las llaves VAPID (ej. en un entorno sin
// configurar), simplemente no manda nada — nunca debe romper la creación
// del pedido.
export async function notifyPushSubscribers(payload: { customerName: string; total: number; orderId: string }) {
  if (!ensureConfigured()) return;

  let rows: SubscriptionRow[] = [];
  try {
    const result = await query(`select endpoint, p256dh, auth from push_subscriptions`);
    rows = result.rows as SubscriptionRow[];
  } catch {
    return;
  }
  if (rows.length === 0) return;

  const body = JSON.stringify({
    title: "🔔 Nuevo pedido — Cómo Sería",
    body: `${payload.customerName} · $${payload.total.toLocaleString("es-CO")}`,
    orderId: payload.orderId,
  });

  await Promise.all(
    rows.map(async (row) => {
      try {
        await webpush.sendNotification(
          { endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } },
          body
        );
        console.log(`[push] enviado OK a ${row.endpoint.slice(0, 60)}...`);
      } catch (err: unknown) {
        // 404/410 = el navegador invalidó esa suscripción (ej. se desinstaló,
        // se revocó el permiso) — se borra para no reintentar en vano.
        const statusCode = (err as { statusCode?: number })?.statusCode;
        const message = (err as { message?: string })?.message;
        console.error(`[push] FALLÓ para ${row.endpoint.slice(0, 60)}... status=${statusCode} msg=${message}`);
        if (statusCode === 404 || statusCode === 410) {
          await query(`delete from push_subscriptions where endpoint = $1`, [row.endpoint]).catch(() => {});
        }
      }
    })
  );
}
