// Impresión de comandas directo a impresoras térmicas Bluetooth (BLE) desde
// el navegador, sin depender de RawBT ni del diálogo de impresión del
// sistema. Confirmado contra una "PrinterLE_1F65" (Digital POS DIG-ISH58):
// expone el servicio/característica genéricos que usan la mayoría de
// impresoras térmicas BLE baratas (no hay un estándar único, pero este es
// por lejos el más común).
const PRINTER_SERVICE_UUID = "000018f0-0000-1000-8000-00805f9b34fb";
const PRINTER_CHARACTERISTIC_UUID = "00002af1-0000-1000-8000-00805f9b34fb";

// Cada impresora queda ligada a ESTE navegador/dispositivo (el emparejamiento
// Bluetooth es físico, de corto alcance) — se puede vincular más de una,
// para el caso de varias estaciones de impresión (ej. cocina + caja).
const LINKED_PRINTERS_KEY = "cs-admin-linked-printers";
// 58mm a fuente estándar (Font A, 12x24) imprime ~32 caracteres por línea.
const LINE_WIDTH = 32;

export function isBluetoothPrintingSupported() {
  return typeof navigator !== "undefined" && "bluetooth" in navigator;
}

export function getLinkedPrinters() {
  try {
    const raw = localStorage.getItem(LINKED_PRINTERS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveLinkedPrinters(list) {
  try {
    localStorage.setItem(LINKED_PRINTERS_KEY, JSON.stringify(list));
  } catch {
    // si el almacenamiento no está disponible, simplemente no persiste
  }
}

// El objeto BluetoothDevice que devuelve requestDevice() se guarda en
// memoria (dura mientras la pestaña siga abierta) — así, apenas se vincula
// una impresora, ya se puede imprimir en la misma sesión sin depender de que
// el navegador soporte "permisos persistentes" (getDevices), que no todos
// los Android/Chrome tienen disponible todavía.
const deviceCache = new Map();

export async function linkNewPrinter(label) {
  // "filters: services" solo encuentra dispositivos que ANUNCIAN ese UUID en
  // el paquete de BLE advertising — muchas impresoras baratas (como la
  // probada) no lo anuncian ahí, aunque sí lo expongan una vez conectadas, y
  // en Android esto hacía que el selector no mostrara nada. acceptAllDevices
  // muestra todos los dispositivos cercanos (como en la prueba que sí
  // funcionó) y optionalServices igual da permiso para usar ese servicio
  // después de conectar.
  const device = await navigator.bluetooth.requestDevice({
    acceptAllDevices: true,
    optionalServices: [PRINTER_SERVICE_UUID],
  });
  deviceCache.set(device.id, device);
  const list = getLinkedPrinters();
  const entry = {
    id: device.id,
    name: device.name || "Impresora sin nombre",
    label: label?.trim() || device.name || "Impresora",
  };
  const idx = list.findIndex((p) => p.id === device.id);
  if (idx >= 0) list[idx] = entry;
  else list.push(entry);
  saveLinkedPrinters(list);
  return entry;
}

export function renamePrinter(id, label) {
  const list = getLinkedPrinters();
  const printer = list.find((p) => p.id === id);
  if (printer) {
    printer.label = label?.trim() || printer.name;
    saveLinkedPrinters(list);
  }
}

export function unlinkPrinter(id) {
  saveLinkedPrinters(getLinkedPrinters().filter((p) => p.id !== id));
}

// 1. Si ya se vinculó en esta misma sesión (pestaña sin recargar), se
//    reutiliza esa referencia en memoria — funciona siempre, sin depender de
//    soporte del navegador.
// 2. Si no, Chrome permite recuperar dispositivos ya autorizados sin volver
//    a mostrar el selector ("permisos persistentes" vía getDevices) — pero
//    no todos los navegadores/versiones de Android lo soportan todavía.
// Si ninguna de las dos funciona (ej. se recargó la página y el navegador no
// soporta getDevices), hay que volver a vincular la impresora manualmente.
async function findAuthorizedDevice(id) {
  if (deviceCache.has(id)) return deviceCache.get(id);
  if (!navigator.bluetooth.getDevices) return null;
  const devices = await navigator.bluetooth.getDevices();
  const found = devices.find((d) => d.id === id) || null;
  if (found) deviceCache.set(id, found);
  return found;
}

async function getWritableCharacteristic(device) {
  const server = device.gatt.connected ? device.gatt : await device.gatt.connect();
  const service = await server.getPrimaryService(PRINTER_SERVICE_UUID);
  return service.getCharacteristic(PRINTER_CHARACTERISTIC_UUID);
}

async function writeInChunks(characteristic, bytes) {
  // Muchas impresoras BLE baratas solo aceptan paquetes pequeños (ligadas al
  // MTU por defecto de BLE, ~20 bytes) — mandar todo de una vez suele hacer
  // que se corte o se pierda parte del contenido.
  const CHUNK_SIZE = 20;
  for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
    const chunk = bytes.slice(i, i + CHUNK_SIZE);
    if (characteristic.writeValueWithoutResponse) {
      await characteristic.writeValueWithoutResponse(chunk);
    } else {
      await characteristic.writeValue(chunk);
    }
    await new Promise((resolve) => setTimeout(resolve, 15));
  }
}

// Manda el ticket a UNA impresora específica, elegida por el admin por su
// etiqueta al momento de imprimir.
export async function printToPrinter(printerId, bytes) {
  const printer = getLinkedPrinters().find((p) => p.id === printerId);
  if (!printer) throw new Error("Esa impresora ya no está vinculada");
  const device = await findAuthorizedDevice(printerId);
  if (!device) throw new Error("Sin permiso persistente — hay que volver a vincularla");
  const characteristic = await getWritableCharacteristic(device);
  await writeInChunks(characteristic, bytes);
}

// O, si el admin lo prefiere, manda a TODAS las vinculadas de una vez (ej.
// cocina + caja al mismo tiempo). No aborta si alguna falla — sigue con las
// demás y devuelve el resultado de cada una.
export async function printToAllPrinters(bytes) {
  const linked = getLinkedPrinters();
  const results = [];
  for (const printer of linked) {
    try {
      await printToPrinter(printer.id, bytes);
      results.push({ label: printer.label, ok: true });
    } catch (err) {
      results.push({ label: printer.label, ok: false, error: err?.message || String(err) });
    }
  }
  return results;
}

// ── Construcción del ticket en comandos ESC/POS ─────────────────────────

// Copia local de la misma lógica de AdminDashboard.jsx — se duplica (en vez
// de importarla) para no crear una dependencia circular entre los dos módulos.
function formatAdicion(a, itemQty = 1) {
  const qty = a.qty ?? 1;
  const total = qty * itemQty;
  const label = total > 1 ? `${a.name} x${total}` : a.name;
  return itemQty > 1 ? `${label} (x${qty} c/u)` : label;
}

const ESC = "\x1B";
const GS = "\x1D";
const INIT = `${ESC}@`;
const ALIGN_LEFT = `${ESC}a\x00`;
const ALIGN_CENTER = `${ESC}a\x01`;
const BOLD_ON = `${ESC}E\x01`;
const BOLD_OFF = `${ESC}E\x00`;
const FEED_AND_CUT = `\n\n\n\n${GS}V\x00`; // corte parcial; si la impresora no tiene cuchilla, simplemente lo ignora

function padTwoColumns(left, right) {
  const l = String(left);
  const r = String(right);
  const spaces = Math.max(1, LINE_WIDTH - l.length - r.length);
  return l + " ".repeat(spaces) + r + "\n";
}

function divider(char = "-") {
  return char.repeat(LINE_WIDTH) + "\n";
}

export function buildComandaEscPos(order) {
  let out = INIT;
  out += ALIGN_CENTER + BOLD_ON + divider("=") + "APP DOMICILIOS\n" + divider("=") + BOLD_OFF;
  out += BOLD_ON + "COMO SERIA\n" + BOLD_OFF;
  out += "COMANDA\n";
  out += ALIGN_LEFT + divider();
  out += `Cliente: ${order.customerName}\n`;
  out += `${order.date} - ${order.time}\n`;
  out += divider();

  order.products.forEach((item) => {
    out += BOLD_ON + padTwoColumns(`${item.qty} x ${item.name}`, fmtPlain((item.totalPrice ?? 0) * (item.qty || 1))) + BOLD_OFF;
    if (item.removedIngredients?.length > 0) out += `Sin: ${item.removedIngredients.join(", ")}\n`;
    if (item.bebida) out += `Bebida: ${item.bebida.name}\n`;
    if (item.side) out += `${item.side.name}\n`;
    if (item.adiciones?.length > 0) {
      item.adiciones.forEach((a) => { out += `+ ${formatAdicion(a, item.qty)}\n`; });
    }
    if (item.agrandarPapas) out += "Papas grandes\n";
    if (item.comment) out += `Nota: ${item.comment}\n`;
  });

  out += divider();
  out += order.deliveryType === "domicilio"
    ? `Domicilio: ${order.deliveryLocation || ""}\n`
    : "Para recoger en tienda\n";
  if (order.deliveryType === "domicilio" && order.deliveryAddress) {
    out += BOLD_ON + `DIRECCION: ${order.deliveryAddress}\n` + BOLD_OFF;
  }
  if (order.paymentMethod) out += `Pago: ${order.paymentMethod}\n`;
  out += divider();
  out += padTwoColumns("Subtotal", fmtPlain(order.subtotal));
  if (order.deliveryFee > 0) out += padTwoColumns("Domicilio", fmtPlain(order.deliveryFee));
  out += BOLD_ON + padTwoColumns("TOTAL", fmtPlain(order.total)) + BOLD_OFF;
  out += divider();
  out += ALIGN_CENTER + "Gracias por tu pedido!\n";
  out += FEED_AND_CUT;

  // Las impresoras térmicas baratas no manejan tildes/eñes de forma
  // confiable con ningún códepage sin pruebas específicas por modelo — se
  // simplifican para que el texto salga siempre legible.
  return new TextEncoder().encode(stripAccents(out));
}

function fmtPlain(n) {
  return "$" + Math.round(n || 0).toLocaleString("es-CO");
}

function stripAccents(str) {
  return str
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // marcas de acento tras descomponer (á -> a + ´)
    .replace(/[¡¿]/g, "");
}
