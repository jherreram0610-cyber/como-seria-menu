import crypto from "node:crypto";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { query } from "../_lib/db.js";
import { isAdminRequest, requireAdmin } from "../_lib/auth.js";

interface Account {
  label: string;
  value: string;
}

interface PaymentMethodRow {
  id: string;
  label: string;
  accounts: Account[];
  sort_order: number;
  is_active: boolean;
}

function rowToMethod(row: PaymentMethodRow) {
  return { id: row.id, label: row.label, accounts: row.accounts || [], isActive: row.is_active };
}

function validateAccounts(accounts: unknown): accounts is Account[] {
  return (
    Array.isArray(accounts) &&
    accounts.every(
      (a) => a && typeof a === "object" && typeof (a as Account).label === "string" && typeof (a as Account).value === "string"
    )
  );
}

interface CreateBody {
  label?: string;
  accounts?: Account[];
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === "GET") {
    const wantsAll = req.query.all === "1" && isAdminRequest(req);
    const { rows } = await query(
      wantsAll
        ? `select * from payment_methods where is_deleted = false order by sort_order, created_at`
        : `select * from payment_methods where is_deleted = false and is_active = true order by sort_order, created_at`
    );
    return res.status(200).json({ paymentMethods: (rows as PaymentMethodRow[]).map(rowToMethod) });
  }

  if (req.method === "POST") {
    if (!requireAdmin(req, res)) return;

    const body = (req.body || {}) as CreateBody;
    const { label } = body;
    if (!label || !label.trim()) {
      return res.status(400).json({ error: "label es requerido" });
    }
    const accounts = body.accounts ?? [];
    if (!validateAccounts(accounts)) {
      return res.status(400).json({ error: "accounts debe ser una lista de { label, value }" });
    }

    const id = crypto.randomUUID();
    const { rows: orderRows } = await query(`select coalesce(max(sort_order), -1) + 1 as next from payment_methods`);
    const sortOrder = orderRows[0].next;

    const { rows } = await query(
      `insert into payment_methods (id, label, accounts, sort_order) values ($1, $2, $3, $4) returning *`,
      [id, label.trim(), JSON.stringify(accounts), sortOrder]
    );

    return res.status(201).json({ paymentMethod: rowToMethod(rows[0] as PaymentMethodRow) });
  }

  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({ error: "Método no permitido" });
}
