// Servidor local minimalista que emula las funciones serverless de /api para
// desarrollo (vite dev hace proxy de /api hacia este servidor, ver vite.config.js).
// No se usa en producción — en Vercel cada archivo de /api se despliega tal cual.
//
// Uso: node --env-file=.env --experimental-strip-types scripts/dev-api-server.mjs

import http from "node:http";
import { pathToFileURL } from "node:url";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const apiDir = path.join(__dirname, "..", "api");
const PORT = process.env.DEV_API_PORT || 3001;

const routes = [
  { pattern: /^\/api\/menu\/([^/]+)$/, file: "menu/[id].ts", paramNames: ["id"] },
  { pattern: /^\/api\/menu$/, file: "menu/index.ts" },
  { pattern: /^\/api\/delivery-locations\/([^/]+)$/, file: "delivery-locations/[id].ts", paramNames: ["id"] },
  { pattern: /^\/api\/delivery-locations$/, file: "delivery-locations/index.ts" },
  { pattern: /^\/api\/orders$/, file: "orders/index.ts" },
  { pattern: /^\/api\/admin\/login$/, file: "admin/login.ts" },
  { pattern: /^\/api\/admin\/logout$/, file: "admin/logout.ts" },
  { pattern: /^\/api\/admin\/me$/, file: "admin/me.ts" },
];

function readBody(req) {
  return new Promise((resolve) => {
    let raw = "";
    req.on("data", (chunk) => (raw += chunk));
    req.on("end", () => {
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        resolve({});
      }
    });
  });
}

function decorateResponse(res) {
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (body) => {
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(body));
  };
  return res;
}

const server = http.createServer(async (req, res) => {
  decorateResponse(res);
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const match = routes.find((r) => r.pattern.test(url.pathname));

  if (!match) {
    return res.status(404).json({ error: "Ruta no encontrada" });
  }

  req.query = Object.fromEntries(url.searchParams.entries());
  if (match.paramNames) {
    const groups = url.pathname.match(match.pattern);
    match.paramNames.forEach((name, i) => (req.query[name] = groups[i + 1]));
  }
  req.body = await readBody(req);

  try {
    const modUrl = pathToFileURL(path.join(apiDir, match.file)).href;
    const mod = await import(modUrl);
    await mod.default(req, res);
  } catch (err) {
    console.error(err);
    if (!res.headersSent) res.status(500).json({ error: "Error interno" });
  }
});

server.listen(PORT, () => {
  console.log(`✓ API local escuchando en http://localhost:${PORT} (proxied desde /api)`);
});
