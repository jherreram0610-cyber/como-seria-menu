import crypto from "node:crypto";
import type { VercelRequest, VercelResponse } from "@vercel/node";

interface SignatureBody {
  orderId?: string;
  amount?: number | string;
  currency?: string;
}

// Genera la firma de integridad SHA256 que exige el Botón de pagos de Bold.
// Debe vivir en el servidor: BOLD_SECRET_KEY nunca puede llegar al frontend.
export default function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Método no permitido" });
  }

  const { orderId, amount, currency } = (req.body || {}) as SignatureBody;

  if (!orderId || !amount || !currency) {
    return res.status(400).json({ error: "orderId, amount y currency son requeridos" });
  }

  if (!Number.isInteger(Number(amount))) {
    return res.status(400).json({ error: "amount debe ser un entero sin decimales" });
  }

  const secretKey = process.env.BOLD_SECRET_KEY;
  if (!secretKey) {
    return res.status(500).json({ error: "BOLD_SECRET_KEY no configurada en el servidor" });
  }

  const raw = `${orderId}${amount}${currency}${secretKey}`;
  const signature = crypto.createHash("sha256").update(raw).digest("hex");

  return res.status(200).json({ signature });
}
