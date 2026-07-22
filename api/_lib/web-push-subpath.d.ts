// "web-push" no publica un campo "exports" en su package.json, así que se
// importa por su subruta real (ver _lib/push.ts) — esto solo le da tipos a
// esa subruta, reexportando los mismos tipos del paquete público.
declare module "web-push/src/index.js" {
  import webpush from "web-push";
  export = webpush;
}
