import type { VercelRequest, VercelResponse } from "@vercel/node";
import { query } from "../_lib/db.js";
import { requireAdmin } from "../_lib/auth.js";
import { notifyPushSubscribers } from "../_lib/push.js";
import { loadStoreSettings } from "../_lib/storeSettings.js";
import { getStoreStatus } from "../_lib/storeHours.js";

interface CreateOrderBody {
  customerName?: string;
  items?: unknown[];
  subtotal?: number;
  deliveryFee?: number;
  total?: number;
  deliveryType?: string;
  deliveryLocation?: string;
  deliveryAddress?: string;
  paymentMethod?: string;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === "POST") {
    const body = (req.body || {}) as CreateOrderBody;
    const { customerName, items, total, deliveryType } = body;

    if (!customerName || !customerName.trim()) {
      return res.status(400).json({ error: "customerName es requerido" });
    }
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: "items es requerido" });
    }
    if (typeof total !== "number" || !Number.isFinite(total)) {
      return res.status(400).json({ error: "total debe ser un número válido" });
    }
    if (!deliveryType) {
      return res.status(400).json({ error: "deliveryType es requerido" });
    }

    // Fuera de horario o con los pedidos pausados no se recibe nada. El menú ya
    // desactiva el botón; esto cubre una pestaña que quedó abierta desde antes.
    // Si la configuración no se puede leer (ej. migración pendiente) se deja
    // pasar el pedido: es peor perder una venta que dejar entrar una de más.
    let storeSettings = null;
    try {
      storeSettings = await loadStoreSettings();
    } catch (err) {
      console.error("No se pudo leer store_settings, se acepta el pedido:", err);
    }
    if (storeSettings) {
      const status = getStoreStatus(storeSettings, new Date());
      if (!status.isOpen) {
        return res.status(409).json({ error: `${status.title}. ${status.detail}`, closed: true, status });
      }
    }

    const { rows } = await query(
      `insert into orders
        (customer_name, items, subtotal, delivery_fee, total, delivery_type, delivery_location, delivery_address, payment_method)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       returning id, created_at`,
      [
        customerName.trim(),
        JSON.stringify(items),
        body.subtotal ?? total,
        body.deliveryFee ?? 0,
        total,
        deliveryType,
        body.deliveryLocation || null,
        body.deliveryAddress || null,
        body.paymentMethod || null,
      ]
    );

    // No debe bloquear ni fallar la respuesta al cliente si el envío del push
    // tarda o falla — la orden ya quedó guardada, eso es lo importante.
    notifyPushSubscribers({
      customerName: customerName.trim(),
      total,
      orderId: rows[0].id,
    }).catch(() => {});

    return res.status(201).json({ order: rows[0] });
  }

  if (req.method === "GET") {
    if (!requireAdmin(req, res)) return;
    const { rows } = await query(
      `select * from orders where is_deleted = false order by created_at desc limit 500`
    );
    return res.status(200).json({ orders: rows });
  }

  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({ error: "Método no permitido" });
}
