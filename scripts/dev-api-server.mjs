// Servidor local minimalista que emula las funciones serverless de /api para
// desarrollo (vite dev hace proxy de /api hacia este servidor, ver vite.config.js).
// No se usa en producción — en Vercel cada archivo de /api se despliega tal cual.
//
// Los archivos de /api usan imports relativos SIN extensión (ej. "../_lib/db"),
// igual que espera Vercel en producción. Para poder correrlos con Node aquí en
// local, cada archivo se compila al vuelo con esbuild (el mismo bundler que usa
// Vite) en vez de depender de la resolución nativa de módulos de Node.
//
// Uso: node --env-file=.env scripts/dev-api-server.mjs

import http from "node:http";
import { pathToFileURL } from "node:url";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import * as esbuild from "esbuild";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const apiDir = path.join(__dirname, "..", "api");
const PORT = process.env.DEV_API_PORT || 3001;
// Tiene que vivir DENTRO del proyecto (no en el /tmp del sistema) para que Node
// pueda resolver paquetes de npm como "pg" subiendo por sus node_modules.
const buildDir = path.join(__dirname, "..", "node_modules", ".cache", "dev-api");
mkdirSync(buildDir, { recursive: true });
process.on("exit", () => { try { rmSync(buildDir, { recursive: true, force: true }); } catch { /* noop */ } });

async function loadHandler(filePath) {
  const result = await esbuild.build({
    entryPoints: [filePath],
    bundle: true,
    platform: "node",
    format: "esm",
    packages: "external", // deja pg y demás paquetes de npm para que Node los resuelva normal
    write: false,
  });
  const outFile = path.join(buildDir, `${Date.now()}-${Math.random().toString(36).slice(2)}.mjs`);
  writeFileSync(outFile, result.outputFiles[0].text);
  const mod = await import(pathToFileURL(outFile).href);
  rmSync(outFile, { force: true });
  return mod.default;
}

const routes = [
  { pattern: /^\/api\/menu\/([^/]+)$/, file: "menu/[id].ts", paramNames: ["id"] },
  { pattern: /^\/api\/menu$/, file: "menu/index.ts" },
  { pattern: /^\/api\/delivery-locations\/([^/]+)$/, file: "delivery-locations/[id].ts", paramNames: ["id"] },
  { pattern: /^\/api\/delivery-locations$/, file: "delivery-locations/index.ts" },
  { pattern: /^\/api\/categories\/([^/]+)$/, file: "categories/[id].ts", paramNames: ["id"] },
  { pattern: /^\/api\/categories$/, file: "categories/index.ts" },
  { pattern: /^\/api\/orders\/([^/]+)$/, file: "orders/[id].ts", paramNames: ["id"] },
  { pattern: /^\/api\/orders$/, file: "orders/index.ts" },
  { pattern: /^\/api\/top-products$/, file: "top-products.ts" },
  { pattern: /^\/api\/admin\/login$/, file: "admin/login.ts" },
  { pattern: /^\/api\/admin\/logout$/, file: "admin/logout.ts" },
  { pattern: /^\/api\/admin\/me$/, file: "admin/me.ts" },
  { pattern: /^\/api\/admin\/change-password$/, file: "admin/change-password.ts" },
  { pattern: /^\/api\/admin\/change-delete-pin$/, file: "admin/change-delete-pin.ts" },
  { pattern: /^\/api\/push\/public-key$/, file: "push/public-key.ts" },
  { pattern: /^\/api\/push\/subscribe$/, file: "push/subscribe.ts" },
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
    const handler = await loadHandler(path.join(apiDir, match.file));
    await handler(req, res);
  } catch (err) {
    console.error(err);
    if (!res.headersSent) res.status(500).json({ error: "Error interno" });
  }
});

server.listen(PORT, () => {
  console.log(`✓ API local escuchando en http://localhost:${PORT} (proxied desde /api)`);
});
