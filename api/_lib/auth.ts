import crypto from "node:crypto";
import type { VercelRequest, VercelResponse } from "@vercel/node";

const COOKIE_NAME = "cs_admin";
const SESSION_MS = 7 * 24 * 60 * 60 * 1000; // 7 días

function sign(expiresAt: number): string {
  const secret = process.env.ADMIN_SESSION_SECRET || "";
  return crypto.createHmac("sha256", secret).update(String(expiresAt)).digest("hex");
}

function buildToken(): string {
  const expiresAt = Date.now() + SESSION_MS;
  return `${expiresAt}.${sign(expiresAt)}`;
}

function isValidToken(token: string): boolean {
  const [expiresAtStr, signature] = token.split(".");
  const expiresAt = Number(expiresAtStr);
  if (!expiresAtStr || !signature || Number.isNaN(expiresAt)) return false;
  if (Date.now() > expiresAt) return false;
  const expected = sign(expiresAt);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function setAdminCookie(res: VercelResponse) {
  const token = buildToken();
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  res.setHeader(
    "Set-Cookie",
    `${COOKIE_NAME}=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${SESSION_MS / 1000}${secure}`
  );
}

export function clearAdminCookie(res: VercelResponse) {
  res.setHeader("Set-Cookie", `${COOKIE_NAME}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0`);
}

function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  header.split(";").forEach((part) => {
    const idx = part.indexOf("=");
    if (idx === -1) return;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (key) out[key] = decodeURIComponent(value);
  });
  return out;
}

export function isAdminRequest(req: VercelRequest): boolean {
  const cookies = parseCookies(req.headers.cookie);
  const token = cookies[COOKIE_NAME];
  return !!token && isValidToken(token);
}

export function requireAdmin(req: VercelRequest, res: VercelResponse): boolean {
  if (!isAdminRequest(req)) {
    res.status(401).json({ error: "No autorizado" });
    return false;
  }
  return true;
}

// Hash de contraseñas con scrypt (nativo de Node, sin dependencias nuevas).
// Formato guardado: "salt:hash", ambos en hex.
export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPasswordHash(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const candidate = crypto.scryptSync(password, salt, 64).toString("hex");
  const a = Buffer.from(hash, "hex");
  const b = Buffer.from(candidate, "hex");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
