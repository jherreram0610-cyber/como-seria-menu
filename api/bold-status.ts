import type { VercelRequest, VercelResponse } from "@vercel/node";

// Consulta el estado real de una transacción en Bold.
// Se usa como confirmación server-side después de que el cliente vuelve del pago,
// en vez de confiar solo en los query params de la redirección.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Método no permitido" });
  }

  const { id } = req.query;
  if (!id || typeof id !== "string") {
    return res.status(400).json({ error: "Falta el parámetro id (identificador de la venta / order-id)" });
  }

  const identityKey = process.env.BOLD_IDENTITY_KEY;
  if (!identityKey) {
    return res.status(500).json({ error: "BOLD_IDENTITY_KEY no configurada en el servidor" });
  }

  try {
    const boldRes = await fetch(
      `https://payments.api.bold.co/v2/payment-voucher/${encodeURIComponent(id)}`,
      { headers: { Authorization: `x-api-key ${identityKey}` } }
    );

    const data = await boldRes.json();

    if (!boldRes.ok) {
      return res.status(boldRes.status).json({ error: "Bold rechazó la consulta", detail: data });
    }

    return res.status(200).json(data);
  } catch {
    return res.status(502).json({ error: "No se pudo consultar el estado en Bold" });
  }
}
