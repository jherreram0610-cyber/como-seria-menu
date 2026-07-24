import { useState, useEffect, useCallback, useRef } from "react";
import logoImg from "/logo.svg";
import {
  isBluetoothPrintingSupported,
  getLinkedPrinters,
  linkNewPrinter,
  renamePrinter,
  unlinkPrinter,
  printToPrinter,
  printToAllPrinters,
  buildComandaEscPos,
} from "./blePrinter.js";
import { parseFramePosition, serializeFramePosition } from "./framePosition.js";
import { ImageFrameEditor } from "./imagePosition.jsx";

const fmt = (n) => "$" + n.toLocaleString("es-CO");
const formatAdicion = (a, itemQty = 1) => {
  // Pedidos guardados antes de que existiera el stepper de cantidad por
  // adición no tienen `qty` en el JSON — tratarlos como 1 (su significado real).
  const qty = a.qty ?? 1;
  const total = qty * itemQty;
  const label = total > 1 ? `${a.name} x${total}` : a.name;
  return itemQty > 1 ? `${label} (x${qty} c/u)` : label;
};

const IconEye = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);
const IconEyeOff = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17.94 17.94A10.94 10.94 0 0112 20c-7 0-11-8-11-8a21.8 21.8 0 015.06-6.06M9.9 4.24A10.94 10.94 0 0112 4c7 0 11 8 11 8a21.77 21.77 0 01-3.22 4.44M14.12 14.12a3 3 0 11-4.24-4.24" />
    <line x1="1" y1="1" x2="23" y2="23" />
  </svg>
);
const IconPrinter = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="6 9 6 2 18 2 18 9" />
    <path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2" />
    <rect x="6" y="14" width="12" height="8" />
  </svg>
);
const IconTrash = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
  </svg>
);
const IconUser = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
    <circle cx="12" cy="7" r="4" />
  </svg>
);
const IconSun = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
  </svg>
);
const IconMoon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
  </svg>
);
const IconArrowUp = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="19" x2="12" y2="5" />
    <polyline points="5 12 12 5 19 12" />
  </svg>
);

function resizeImageToDataUrl(file, maxWidth = 900, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("No se pudo leer la imagen"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("Imagen inválida"));
      img.onload = () => {
        const scale = Math.min(1, maxWidth / img.width);
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
        // WebP pesa bastante menos que JPEG a calidad similar; si el navegador no
        // soporta codificarlo, toDataURL cae en silencio a PNG (más pesado) y usamos JPEG.
        const webp = canvas.toDataURL("image/webp", quality);
        resolve(webp.startsWith("data:image/webp") ? webp : canvas.toDataURL("image/jpeg", quality));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

// El navegador espera la llave VAPID como Uint8Array, pero se genera/guarda
// en base64url (ver scripts de generación con web-push).
function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

async function api(path, options) {
  const res = await fetch(path, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options?.headers || {}) },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Error ${res.status}`);
  }
  return res.json();
}

const PAYMENT_LABELS = { "qr-bold": "QR de Bold", nequi: "Nequi", transferencia: "Transferencia" };
const KNOWN_ORDER_IDS_KEY = "cs-admin-known-order-ids";
const RANK_MEDALS = ["🥇", "🥈", "🥉"];
const rankBadge = (i) => RANK_MEDALS[i] || `#${i + 1}`;

// OJO: nunca usar toISOString() para sacar la fecha — convierte a UTC y en
// Colombia (UTC-5) cualquier pedido después de las 7pm cae "al día siguiente".
// Se usa siempre dateKey() (getters locales del Date), definida más abajo.
const getTodayKey = () => dateKey(new Date());

const getLast7Days = () => {
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    days.push({
      key: dateKey(d),
      label: d.toLocaleDateString("es-CO", { weekday: "short", day: "numeric" }),
      short: d.toLocaleDateString("es-CO", { weekday: "short" }),
    });
  }
  return days;
};

const getMonthStartKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
};

const RANGE_PRESETS = [
  { key: "hoy", label: "Hoy" },
  { key: "semana", label: "Esta semana" },
  { key: "mes", label: "Este mes" },
  { key: "todo", label: "Todo" },
];

function computeRange(preset, customFrom, customTo) {
  const today = getTodayKey();
  if (preset === "hoy") return { from: today, to: today };
  if (preset === "semana") {
    const days = getLast7Days();
    return { from: days[0].key, to: days[days.length - 1].key };
  }
  if (preset === "mes") return { from: getMonthStartKey(), to: today };
  if (preset === "custom") return { from: customFrom || today, to: customTo || today };
  return { from: null, to: null }; // todo
}

function rangeFilenameLabel(preset, range) {
  if (preset === "todo") return "todos";
  if (range.from === range.to) return range.from;
  return `${range.from}_a_${range.to}`;
}

function buildProductRanking(orders) {
  const map = new Map();
  orders.forEach((o) => {
    (o.products || []).forEach((p) => {
      const entry = map.get(p.name) || { name: p.name, qty: 0, total: 0 };
      entry.qty += p.qty || 1;
      entry.total += (p.totalPrice || 0) * (p.qty || 1);
      map.set(p.name, entry);
    });
  });
  return [...map.values()].sort((a, b) => b.qty - a.qty || b.total - a.total).slice(0, 8);
}

function buildPaymentBreakdown(orders) {
  const map = new Map();
  orders.forEach((o) => {
    const key = o.paymentMethod || "sin-especificar";
    const entry = map.get(key) || { method: key, count: 0, total: 0 };
    entry.count += 1;
    entry.total += o.total;
    map.set(key, entry);
  });
  return [...map.values()].sort((a, b) => b.count - a.count || b.total - a.total);
}

function buildDeliveryBreakdown(orders) {
  const domicilioOrders = orders.filter((o) => o.deliveryType === "domicilio");
  const recogerOrders = orders.filter((o) => o.deliveryType !== "domicilio");
  const byZone = new Map();
  domicilioOrders.forEach((o) => {
    const key = o.deliveryLocation || "Sin zona";
    const entry = byZone.get(key) || { name: key, count: 0, deliveryTotal: 0, salesTotal: 0 };
    entry.count += 1;
    entry.deliveryTotal += o.deliveryFee || 0;
    entry.salesTotal += o.total;
    byZone.set(key, entry);
  });
  return {
    recogerCount: recogerOrders.length,
    recogerTotal: recogerOrders.reduce((s, o) => s + o.total, 0),
    domicilioCount: domicilioOrders.length,
    domicilioTotal: domicilioOrders.reduce((s, o) => s + o.total, 0),
    domicilioFeeTotal: domicilioOrders.reduce((s, o) => s + (o.deliveryFee || 0), 0),
    zones: [...byZone.values()].sort((a, b) => b.count - a.count || b.deliveryTotal - a.deliveryTotal),
  };
}

function mapOrderRow(row) {
  const created = new Date(row.created_at);
  const products = Array.isArray(row.items) ? row.items : [];
  return {
    id: row.id,
    date: dateKey(created),
    time: created.toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" }),
    customerName: row.customer_name,
    itemsCount: products.reduce((s, i) => s + (i.qty || 1), 0),
    total: row.total,
    subtotal: row.subtotal,
    deliveryFee: row.delivery_fee,
    deliveryType: row.delivery_type,
    deliveryLocation: row.delivery_location,
    deliveryAddress: row.delivery_address,
    paymentMethod: row.payment_method,
    products,
  };
}

const EXPORT_COLUMNS = ["Fecha", "Hora", "Cliente", "Productos", "Items", "Total"];

function ordersToRows(orders) {
  return orders.map((o) => ({
    Fecha: o.date,
    Hora: o.time,
    Cliente: o.customerName,
    Productos: (o.products || []).map((p) => `${p.name} x${p.qty}`).join(", "),
    Items: o.itemsCount,
    Total: o.total,
  }));
}

// Descripción detallada de un producto del carrito: cambios de bebida, adiciones,
// acompañamiento, papas grandes, ingredientes quitados y comentarios. Solo se usa
// en Excel/PDF (el CSV se deja simple, tal como estaba).
function describeItem(item) {
  const parts = [`${item.name} x${item.qty}`];
  if (item.removedIngredients?.length) {
    parts.push(`Sin: ${item.removedIngredients.join(", ")}`);
  }
  if (item.bebida) {
    const extra = item.category === "combos" && item.bebida.comboExtra ? ` (+${fmt(item.bebida.comboExtra)})` : "";
    parts.push(`Bebida: ${item.bebida.name}${extra}`);
  }
  if (item.side) {
    const extra = item.side.price > 0 ? ` (+${fmt(item.side.price)})` : "";
    parts.push(`${item.side.name}${extra}`);
  }
  if (item.adiciones?.length) {
    parts.push(`Adiciones: ${item.adiciones.map((a) => formatAdicion(a, item.qty)).join(", ")}`);
  }
  if (item.agrandarPapas) parts.push(`Papas grandes (+${fmt(2000)})`);
  if (item.comment) parts.push(`Nota: ${item.comment}`);
  return parts.join(" | ");
}

function ordersToDetailedRows(orders) {
  return orders.map((o) => ({
    Fecha: o.date,
    Hora: o.time,
    Cliente: o.customerName,
    Productos: (o.products || []).map(describeItem).join("; "),
    Items: o.itemsCount,
    Total: o.total,
  }));
}

function downloadBlob(content, filename, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function exportCSV(orders, rangeLabel = getTodayKey()) {
  const rows = ordersToRows(orders);
  const escape = (v) => {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [
    EXPORT_COLUMNS.join(","),
    ...rows.map((r) => EXPORT_COLUMNS.map((c) => escape(r[c])).join(",")),
  ].join("\n");
  downloadBlob(csv, `como-seria-pedidos-${rangeLabel}.csv`, "text/csv;charset=utf-8;");
}

// Excel-compatible export vía tabla HTML (Excel/Sheets/LibreOffice la abren directo).
// Evitamos la librería "xlsx" de npm a propósito: tiene vulnerabilidades altas sin parche.
function exportExcel(orders, rangeLabel = getTodayKey()) {
  const rows = ordersToDetailedRows(orders);
  const escapeHtml = (v) => String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const head = `<tr>${EXPORT_COLUMNS.map((c) => `<th style="background:#1B8C37;color:#fff;padding:6px 10px;text-align:left;">${c}</th>`).join("")}</tr>`;
  const body = rows.map((r) =>
    `<tr>${EXPORT_COLUMNS.map((c) => `<td style="padding:6px 10px;border:1px solid #ddd;">${escapeHtml(r[c])}</td>`).join("")}</tr>`
  ).join("");
  const html = `<html><head><meta charset="UTF-8"></head><body><table>${head}${body}</table></body></html>`;
  downloadBlob(html, `como-seria-pedidos-${rangeLabel}.xls`, "application/vnd.ms-excel;charset=utf-8;");
}

function loadLogoAsPng() {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth || 200;
      canvas.height = img.naturalHeight || 200;
      canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = () => reject(new Error("No se pudo cargar el logo"));
    img.src = "/logo.svg";
  });
}

async function exportPDF(orders, rangeLabel = getTodayKey()) {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);
  const GREEN = [27, 140, 55];
  const doc = new jsPDF({ orientation: "landscape" });
  const pageWidth = doc.internal.pageSize.getWidth();

  doc.setFillColor(...GREEN);
  doc.rect(0, 0, pageWidth, 26, "F");
  try {
    const logoPng = await loadLogoAsPng();
    doc.addImage(logoPng, "PNG", 12, 5, 16, 16);
  } catch {
    // sin logo si falla la carga, no bloquea el resto del PDF
  }
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16);
  doc.text("CÓMO SERÍA", 34, 13);
  doc.setFontSize(10);
  doc.text(`Reporte de pedidos - ${rangeLabel}`, 34, 20);

  const rows = ordersToDetailedRows(orders);
  autoTable(doc, {
    startY: 32,
    head: [EXPORT_COLUMNS],
    body: rows.map((r) => EXPORT_COLUMNS.map((c) => (c === "Total" ? fmt(r[c]) : r[c]))),
    headStyles: { fillColor: GREEN, textColor: 255, fontStyle: "bold" },
    alternateRowStyles: { fillColor: [246, 246, 246] },
    styles: { fontSize: 8, cellPadding: 3, textColor: [20, 20, 20], overflow: "linebreak" },
    columnStyles: { 3: { cellWidth: 140 } },
    margin: { top: 32, left: 10, right: 10 },
  });

  doc.save(`como-seria-pedidos-${rangeLabel}.pdf`);
}

// ─── EXPORTS DEL RESUMEN (agregado: top productos, métodos de pago, domicilios) ──
function buildSummaryReport(filteredOrders, productRanking, paymentBreakdown, deliveryBreakdown) {
  const totalRevenue = filteredOrders.reduce((s, o) => s + o.total, 0);
  const avg = filteredOrders.length > 0 ? Math.round(totalRevenue / filteredOrders.length) : 0;
  return {
    overview: [
      { Métrica: "Pedidos", Valor: filteredOrders.length },
      { Métrica: "Ventas totales", Valor: fmt(totalRevenue) },
      { Métrica: "Total domicilios", Valor: fmt(deliveryBreakdown.domicilioFeeTotal) },
      { Métrica: "Promedio por pedido", Valor: fmt(avg) },
    ],
    products: productRanking.map((p, i) => ({ "#": i + 1, Producto: p.name, Cantidad: p.qty, Total: fmt(p.total) })),
    payments: paymentBreakdown.map((p) => ({ Método: PAYMENT_LABELS[p.method] || p.method, Pedidos: p.count, Total: fmt(p.total) })),
    delivery: [
      { Tipo: "Para recoger", Pedidos: deliveryBreakdown.recogerCount, Total: fmt(deliveryBreakdown.recogerTotal) },
      { Tipo: "A domicilio", Pedidos: deliveryBreakdown.domicilioCount, Total: fmt(deliveryBreakdown.domicilioTotal) },
    ],
    zones: deliveryBreakdown.zones.map((z) => ({ Zona: z.name, Pedidos: z.count, "Total domicilio": fmt(z.deliveryTotal) })),
  };
}

function csvBlock(title, rows) {
  if (rows.length === 0) return `${title}\nSin datos`;
  const cols = Object.keys(rows[0]);
  const escape = (v) => {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [title, cols.join(","), ...rows.map((r) => cols.map((c) => escape(r[c])).join(","))].join("\n");
}

function exportSummaryCSV(report, rangeLabel) {
  const csv = [
    csvBlock("RESUMEN", report.overview),
    csvBlock("TOP PRODUCTOS", report.products),
    csvBlock("METODOS DE PAGO", report.payments),
    csvBlock("DOMICILIOS", report.delivery),
    csvBlock("DOMICILIOS POR ZONA", report.zones),
  ].join("\n\n");
  downloadBlob(csv, `como-seria-resumen-${rangeLabel}.csv`, "text/csv;charset=utf-8;");
}

function htmlTableBlock(title, rows) {
  const escapeHtml = (v) => String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  if (rows.length === 0) {
    return `<h3 style="font-family:sans-serif;">${title}</h3><p style="font-family:sans-serif;">Sin datos</p>`;
  }
  const cols = Object.keys(rows[0]);
  const head = `<tr>${cols.map((c) => `<th style="background:#1B8C37;color:#fff;padding:6px 10px;text-align:left;">${c}</th>`).join("")}</tr>`;
  const body = rows.map((r) =>
    `<tr>${cols.map((c) => `<td style="padding:6px 10px;border:1px solid #ddd;">${escapeHtml(r[c])}</td>`).join("")}</tr>`
  ).join("");
  return `<h3 style="font-family:sans-serif;">${title}</h3><table>${head}${body}</table>`;
}

function exportSummaryExcel(report, rangeLabel) {
  const html = `<html><head><meta charset="UTF-8"></head><body>
    ${htmlTableBlock("Resumen", report.overview)}
    ${htmlTableBlock("Top productos", report.products)}
    ${htmlTableBlock("Métodos de pago", report.payments)}
    ${htmlTableBlock("Domicilios", report.delivery)}
    ${htmlTableBlock("Domicilios por zona", report.zones)}
  </body></html>`;
  downloadBlob(html, `como-seria-resumen-${rangeLabel}.xls`, "application/vnd.ms-excel;charset=utf-8;");
}

async function exportSummaryPDF(report, rangeLabel) {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);
  const GREEN = [27, 140, 55];
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();

  doc.setFillColor(...GREEN);
  doc.rect(0, 0, pageWidth, 26, "F");
  try {
    const logoPng = await loadLogoAsPng();
    doc.addImage(logoPng, "PNG", 12, 5, 16, 16);
  } catch {
    // sin logo si falla la carga, no bloquea el resto del PDF
  }
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16);
  doc.text("CÓMO SERÍA", 34, 13);
  doc.setFontSize(10);
  doc.text(`Resumen - ${rangeLabel}`, 34, 20);

  let y = 32;
  const section = (title, rows) => {
    doc.setTextColor(20, 20, 20);
    doc.setFontSize(11);
    doc.text(title, 12, y);
    y += 4;
    if (rows.length === 0) {
      doc.setFontSize(9);
      doc.text("Sin datos", 12, y + 4);
      y += 12;
      return;
    }
    const cols = Object.keys(rows[0]);
    autoTable(doc, {
      startY: y,
      head: [cols],
      body: rows.map((r) => cols.map((c) => r[c])),
      headStyles: { fillColor: GREEN, textColor: 255, fontStyle: "bold" },
      styles: { fontSize: 8, cellPadding: 3 },
      margin: { left: 12, right: 12 },
    });
    y = doc.lastAutoTable.finalY + 10;
  };

  section("Resumen general", report.overview);
  section("Top productos", report.products);
  section("Métodos de pago", report.payments);
  section("Domicilios", report.delivery);
  section("Domicilios por zona", report.zones);

  doc.save(`como-seria-resumen-${rangeLabel}.pdf`);
}

// ─── SELECTOR DE RANGO PERSONALIZADO (calendario propio) ──────────────────
const WEEKDAY_LABELS = ["DO", "LU", "MA", "MI", "JU", "VI", "SA"];

function dateKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function DateRangePicker({ from, to, onChange }) {
  const [open, setOpen] = useState(false);
  const [pickingFrom, setPickingFrom] = useState(true);
  const [viewMonth, setViewMonth] = useState(() => {
    const d = from ? new Date(`${from}T00:00:00`) : new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const wrapRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onOutside = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onOutside);
    return () => document.removeEventListener("mousedown", onOutside);
  }, [open]);

  const monthLabel = viewMonth.toLocaleDateString("es-CO", { month: "long", year: "numeric" });
  const daysInMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 0).getDate();
  const firstWeekday = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), 1).getDay();

  const cells = Array(firstWeekday).fill(null);
  for (let day = 1; day <= daysInMonth; day++) cells.push(new Date(viewMonth.getFullYear(), viewMonth.getMonth(), day));

  const changeMonth = (delta) => setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() + delta, 1));

  const handleDayClick = (date) => {
    const key = dateKey(date);
    if (pickingFrom || key < from) {
      onChange({ from: key, to: key });
      setPickingFrom(false);
    } else {
      onChange({ from, to: key });
      setPickingFrom(true);
      setOpen(false);
    }
  };

  const goToday = () => {
    const key = dateKey(new Date());
    onChange({ from: key, to: key });
    setPickingFrom(false);
    setViewMonth(new Date());
  };

  return (
    <div className="adm-datepicker" ref={wrapRef}>
      <button type="button" className="adm-range-btn adm-datepicker-trigger" onClick={() => setOpen((o) => !o)}>
        📅 {from && to ? (from === to ? from : `${from} a ${to}`) : "Elegir fechas"}
      </button>
      {open && (
        <div className="adm-datepicker-pop">
          <div className="adm-datepicker-nav">
            <button type="button" onClick={() => changeMonth(-1)}>‹</button>
            <span>{monthLabel}</span>
            <button type="button" onClick={() => changeMonth(1)}>›</button>
          </div>
          <div className="adm-datepicker-weekdays">
            {WEEKDAY_LABELS.map((d) => <span key={d}>{d}</span>)}
          </div>
          <div className="adm-datepicker-grid">
            {cells.map((date, i) => {
              if (!date) return <span key={i} />;
              const key = dateKey(date);
              const isEndpoint = key === from || key === to;
              const inRange = from && to && key > from && key < to;
              return (
                <button
                  type="button"
                  key={key}
                  className={`adm-datepicker-day ${isEndpoint ? "selected" : ""} ${inRange ? "in-range" : ""}`}
                  onClick={() => handleDayClick(date)}
                >
                  {date.getDate()}
                </button>
              );
            })}
          </div>
          <div className="adm-datepicker-footer">
            <button type="button" onClick={goToday}>Hoy</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── STAT CARD ─────────────────────────────────────────────────────────────
function StatCard({ icon, label, value, sub, accent }) {
  return (
    <div className="adm-stat-card" style={accent ? { borderColor: accent } : {}}>
      <div className="adm-stat-icon" style={accent ? { background: accent + "22", color: accent } : {}}>
        {icon}
      </div>
      <div className="adm-stat-info">
        <div className="adm-stat-label">{label}</div>
        <div className="adm-stat-value">{value}</div>
        {sub && <div className="adm-stat-sub">{sub}</div>}
      </div>
    </div>
  );
}

// Genera un path SVG suave (Catmull-Rom → Bézier) a través de una serie de puntos.
// Curva Hermite monotónica (Fritsch–Carlson), no Catmull-Rom: a diferencia de
// una spline "suave" normal, esta nunca rebasa el rango de los puntos vecinos,
// así que una racha de días en $0 seguida de un salto no dibuja un valle falso
// por debajo de la línea base.
function smoothPath(points) {
  const n = points.length;
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const dx = xs[1] - xs[0];

  const d = [];
  for (let i = 0; i < n - 1; i++) d.push((ys[i + 1] - ys[i]) / dx);

  const m = new Array(n);
  m[0] = d[0];
  m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) {
    m[i] = d[i - 1] === 0 || d[i] === 0 || (d[i - 1] > 0) !== (d[i] > 0) ? 0 : (d[i - 1] + d[i]) / 2;
  }

  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) {
      m[i] = 0;
      m[i + 1] = 0;
      continue;
    }
    const a = m[i] / d[i];
    const b = m[i + 1] / d[i];
    const s = a * a + b * b;
    if (s > 9) {
      const tau = 3 / Math.sqrt(s);
      m[i] = tau * a * d[i];
      m[i + 1] = tau * b * d[i];
    }
  }

  let path = `M${xs[0]},${ys[0]}`;
  for (let i = 0; i < n - 1; i++) {
    const cp1x = xs[i] + dx / 3;
    const cp1y = ys[i] + (m[i] * dx) / 3;
    const cp2x = xs[i + 1] - dx / 3;
    const cp2y = ys[i + 1] - (m[i + 1] * dx) / 3;
    path += ` C${cp1x},${cp1y} ${cp2x},${cp2y} ${xs[i + 1]},${ys[i + 1]}`;
  }
  return path;
}

// Gráfico de área/línea de ventas: la altura codifica la venta ($), y la
// cantidad de pedidos se ve en el tooltip (por defecto muestra "Hoy").
function TrendChart({ orders }) {
  const days = getLast7Days();
  const today = getTodayKey();
  const [hoverIndex, setHoverIndex] = useState(null);
  const svgRef = useRef(null);

  const dataByDay = {};
  orders.forEach((o) => {
    const entry = dataByDay[o.date] || { count: 0, revenue: 0 };
    entry.count += 1;
    entry.revenue += o.total;
    dataByDay[o.date] = entry;
  });

  const W = 700, H = 200, PAD_X = 28, PAD_TOP = 46, PAD_BOTTOM = 26;
  const plotW = W - PAD_X * 2;
  const plotH = H - PAD_TOP - PAD_BOTTOM;
  const maxRevenue = Math.max(...days.map((d) => dataByDay[d.key]?.revenue || 0), 1);
  const baseY = PAD_TOP + plotH;

  const points = days.map((d, i) => {
    const data = dataByDay[d.key] || { count: 0, revenue: 0 };
    const x = PAD_X + (plotW / (days.length - 1)) * i;
    const y = baseY - (data.revenue / maxRevenue) * plotH;
    return { x, y, day: d, ...data };
  });

  const linePath = smoothPath(points);
  const areaPath = `${linePath} L${points[points.length - 1].x},${baseY} L${points[0].x},${baseY} Z`;

  const handleMove = (e) => {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const localX = ((e.clientX - rect.left) / rect.width) * W;
    let closest = 0;
    let minDist = Infinity;
    points.forEach((p, i) => {
      const dist = Math.abs(p.x - localX);
      if (dist < minDist) { minDist = dist; closest = i; }
    });
    setHoverIndex(closest);
  };

  const activeIndex = hoverIndex != null ? hoverIndex : points.findIndex((p) => p.day.key === today);
  const active = points[activeIndex >= 0 ? activeIndex : points.length - 1];

  const tooltipW = 132, tooltipH = 44;
  const tipX = Math.max(4, Math.min(W - tooltipW - 4, active.x - tooltipW / 2));
  const tipY = Math.max(2, active.y - tooltipH - 10);

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${W} ${H}`}
      className="adm-trend-chart"
      onMouseMove={handleMove}
      onMouseLeave={() => setHoverIndex(null)}
    >
      <defs>
        <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#2AAF4A" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#2AAF4A" stopOpacity="0" />
        </linearGradient>
      </defs>

      <line x1={PAD_X} y1={baseY} x2={W - PAD_X} y2={baseY} className="adm-trend-baseline" />
      <line x1={active.x} y1={PAD_TOP} x2={active.x} y2={baseY} className="adm-trend-guide" />

      <path d={areaPath} className="adm-trend-area" />
      <path d={linePath} className="adm-trend-line" />

      {points.map((p, i) => (
        <circle
          key={p.day.key}
          cx={p.x} cy={p.y}
          r={i === activeIndex ? 6 : 3.5}
          className={`adm-trend-dot ${p.day.key === today ? "today" : ""}`}
        />
      ))}

      {points.map((p) => (
        <text key={p.day.key} x={p.x} y={H - 6} textAnchor="middle" className={`adm-trend-day-label ${p.day.key === today ? "today" : ""}`}>
          {p.day.short}
        </text>
      ))}

      <g transform={`translate(${tipX}, ${tipY})`}>
        <rect width={tooltipW} height={tooltipH} rx="10" className="adm-trend-tooltip-bg" />
        <text x={tooltipW / 2} y="18" textAnchor="middle" className="adm-trend-tooltip-title">
          {active.count} {active.count === 1 ? "pedido" : "pedidos"}
        </text>
        <text x={tooltipW / 2} y="35" textAnchor="middle" className="adm-trend-tooltip-value">
          {fmt(active.revenue)}
        </text>
      </g>
    </svg>
  );
}

// ─── DETALLE DE UN PEDIDO ──────────────────────────────────────────────────
function OrderDetail({ order }) {
  return (
    <div className="adm-order-detail">
      <div className="adm-order-detail-meta">
        {order.deliveryType === "domicilio" ? (
          <span>🛵 Domicilio · {order.deliveryLocation}{order.deliveryAddress ? ` — ${order.deliveryAddress}` : ""}</span>
        ) : (
          <span>🏪 Para recoger en tienda</span>
        )}
        {order.paymentMethod && (
          <span>💳 {PAYMENT_LABELS[order.paymentMethod] || order.paymentMethod}</span>
        )}
      </div>

      {order.products.map((item, i) => (
        <div key={i} className="adm-order-item">
          <div className="adm-order-item-top">
            <span className="adm-order-item-name">{item.name} <span className="adm-order-item-qty">x{item.qty}</span></span>
            <span className="adm-order-item-price">{fmt((item.totalPrice ?? 0) * (item.qty || 1))}</span>
          </div>
          {item.removedIngredients?.length > 0 && (
            <div className="adm-order-item-line">❌ Sin: {item.removedIngredients.join(", ")}</div>
          )}
          {item.bebida && <div className="adm-order-item-line">🥤 Bebida: {item.bebida.name}</div>}
          {item.side && <div className="adm-order-item-line">🍟 {item.side.name}</div>}
          {item.adiciones?.length > 0 && (
            <div className="adm-order-item-line">➕ {item.adiciones.map((a) => formatAdicion(a, item.qty)).join(", ")}</div>
          )}
          {item.agrandarPapas && <div className="adm-order-item-line">🍟 Papas grandes</div>}
          {item.comment && <div className="adm-order-item-line">💬 {item.comment}</div>}
        </div>
      ))}

      <div className="adm-order-detail-totals">
        <span>Subtotal: {fmt(order.subtotal)}</span>
        {order.deliveryFee > 0 && <span>Domicilio: {fmt(order.deliveryFee)}</span>}
        <span className="adm-order-detail-total">Total: {fmt(order.total)}</span>
      </div>
    </div>
  );
}

// Si no hay ninguna impresora Bluetooth vinculada, se comporta igual que
// antes (un solo clic, imprime con el sistema). Si hay una o más, abre un
// menú para elegir a cuál mandar la comanda (o a todas a la vez).
function PrintButton({ order, onPrint }) {
  const [open, setOpen] = useState(false);
  const [menuPos, setMenuPos] = useState(null);
  const btnRef = useRef(null);
  const printers = getLinkedPrinters();

  if (printers.length === 0) {
    return (
      <button
        className="adm-order-print-btn"
        title="Vincula una impresora Bluetooth primero"
        onClick={(e) => { e.stopPropagation(); onPrint(order, "none"); }}
      >
        <IconPrinter />
      </button>
    );
  }

  // El menú se posiciona "fixed" con las coordenadas del botón en vez de
  // "absolute" dentro de la fila del pedido: la lista de pedidos recorta
  // (overflow: hidden) cualquier cosa que se salga de una fila, así que un
  // menú "absolute" quedaba tapado por los pedidos de abajo.
  const toggleOpen = () => {
    if (!open && btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      setMenuPos({ top: rect.bottom + 6, right: window.innerWidth - rect.right });
    }
    setOpen((v) => !v);
  };

  return (
    <div onClick={(e) => e.stopPropagation()}>
      <button ref={btnRef} className="adm-order-print-btn" title="Elegir impresora" onClick={toggleOpen}>
        <IconPrinter />
      </button>
      {open && menuPos && (
        <>
          <div className="adm-dropdown-catcher" onClick={() => setOpen(false)} />
          <div className="adm-profile-dropdown" style={{ position: "fixed", top: menuPos.top, right: menuPos.right }}>
            {printers.map((p) => (
              <div key={p.id} style={{ display: "flex", alignItems: "center" }}>
                <button style={{ flex: 1 }} onClick={() => { setOpen(false); onPrint(order, p.id); }}>
                  🖨️ {p.label}
                </button>
                <button
                  title="Reconectar esta impresora (si dio error de permiso) y mandarle la comanda"
                  onClick={async (e) => {
                    e.stopPropagation();
                    try {
                      await linkNewPrinter(p.label);
                      setOpen(false);
                      onPrint(order, p.id);
                    } catch {
                      // el usuario canceló el selector, o falló — se queda el menú abierto
                    }
                  }}
                >
                  🔄
                </button>
              </div>
            ))}
            <button onClick={() => { setOpen(false); onPrint(order, "all"); }}>📠 Todas</button>
          </div>
        </>
      )}
    </div>
  );
}

// ─── RECENT ORDERS ─────────────────────────────────────────────────────────
function RecentOrders({ orders, onPrint, onDelete, highlightOrderId }) {
  const [expandedId, setExpandedId] = useState(null);
  const [flashId, setFlashId] = useState(null);
  const [seenHighlight, setSeenHighlight] = useState(null);
  const recent = orders.slice(0, 15);

  // Al recibir un highlightOrderId nuevo (click en la notificación o el banner),
  // expande y resalta ese pedido. Se ajusta durante el render (no en un efecto)
  // porque es simplemente sincronizar el estado con la prop entrante.
  if (highlightOrderId && highlightOrderId !== seenHighlight) {
    setSeenHighlight(highlightOrderId);
    setExpandedId(highlightOrderId);
    setFlashId(highlightOrderId);
  }

  useEffect(() => {
    if (!highlightOrderId) return;
    document.getElementById(`order-${highlightOrderId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [highlightOrderId]);

  useEffect(() => {
    if (!flashId) return;
    const t = setTimeout(() => setFlashId(null), 2400);
    return () => clearTimeout(t);
  }, [flashId]);

  if (recent.length === 0) {
    return (
      <div className="adm-empty-orders">
        <div className="adm-empty-icon">📦</div>
        <p>Aún no hay pedidos registrados.<br />Se guardarán automáticamente cuando un cliente envíe su pedido.</p>
      </div>
    );
  }
  return (
    <div className="adm-orders-list">
      {recent.map((o, i) => {
        const isOpen = expandedId === o.id;
        return (
          <div
            key={o.id || i}
            id={`order-${o.id}`}
            className={`adm-order-wrap ${flashId === o.id ? "adm-order-flash" : ""} ${isOpen ? "adm-order-open" : ""}`}
          >
            <div className="adm-order-row adm-order-row-clickable" onClick={() => setExpandedId(isOpen ? null : o.id)}>
              <div className="adm-order-left">
                <div className="adm-order-name">
                  <span className="adm-order-index">#{i + 1}</span>
                  {o.customerName}
                </div>
                <div className="adm-order-meta">
                  {o.date} · {o.time} · {o.itemsCount} {o.itemsCount === 1 ? "producto" : "productos"}
                </div>
              </div>
              <div className="adm-order-right">
                <PrintButton order={o} onPrint={onPrint} />
                <button
                  className="adm-order-delete-btn"
                  title="Eliminar pedido"
                  onClick={(e) => { e.stopPropagation(); onDelete(o); }}
                >
                  <IconTrash />
                </button>
                <div className="adm-order-total">{fmt(o.total)}</div>
                <span className="adm-order-chevron">{isOpen ? "▾" : "▸"}</span>
              </div>
            </div>
            {isOpen && <OrderDetail order={o} />}
          </div>
        );
      })}
    </div>
  );
}


// ─── FORMULARIO DE PRODUCTO ────────────────────────────────────────────────
function ProductForm({ initial, categories, onSubmit, onCancel }) {
  const isEditing = !!initial?.id;
  const [category, setCategory] = useState(initial?.category || categories[0]?.id || "");
  const [name, setName] = useState(initial?.name || "");
  const [price, setPrice] = useState(initial?.price ?? "");
  const [desc, setDesc] = useState(initial?.desc || "");
  const [ingredients, setIngredients] = useState((initial?.ingredients || []).join(", "));
  const [burger, setBurger] = useState(initial?.burger || "");
  const [comboExtra, setComboExtra] = useState(initial?.comboExtra ?? "");
  const [allowCustomization, setAllowCustomization] = useState(initial?.allowCustomization !== false);
  const [isNew, setIsNew] = useState(!!initial?.isNew);
  const [popular, setPopular] = useState(!!initial?.popular);
  const [specialEdition, setSpecialEdition] = useState(!!initial?.special || !!initial?.isBurgerMaster);
  const [burgerImg, setBurgerImg] = useState(initial?.burgerImg || null);
  const [imgPosition, setImgPosition] = useState(() => parseFramePosition(initial?.burgerImgPosition));
  const [imageBusy, setImageBusy] = useState(false);
  const [imageError, setImageError] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleImageChange = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setImageError("");
    setImageBusy(true);
    try {
      const dataUrl = await resizeImageToDataUrl(file);
      setBurgerImg(dataUrl);
      setImgPosition({ x: 50, y: 50, zoom: 1 }); // foto nueva: arranca centrada/sin zoom, no con el encuadre de la anterior
    } catch {
      setImageError("No se pudo procesar la imagen. Intenta con otra.");
    } finally {
      setImageBusy(false);
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!name.trim() || price === "") {
      setError("Nombre y precio son obligatorios");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await onSubmit({
        category,
        name: name.trim(),
        price: Number(price),
        desc: desc.trim(),
        ingredients: ingredients.split(",").map((s) => s.trim()).filter(Boolean),
        burger: category === "combos" && burger.trim() ? burger.trim() : null,
        comboExtra: category === "bebidas" && comboExtra !== "" ? Number(comboExtra) : null,
        allowCustomization,
        isNew,
        popular,
        special: specialEdition,
        burgerImg,
        burgerImgPosition: burgerImg ? serializeFramePosition(imgPosition) : null,
      });
    } catch (err) {
      setError(err.message || "No se pudo guardar");
      setSaving(false);
    }
  };

  return (
    <form className="adm-product-form" onSubmit={submit}>
      <label className="adm-form-field">
        Categoría
        <select value={category} onChange={(e) => setCategory(e.target.value)} disabled={isEditing}>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.icon} {c.label}</option>
          ))}
        </select>
      </label>
      <label className="adm-form-field">
        Nombre
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej: La Clásica" />
      </label>
      <label className="adm-form-field">
        Precio
        <input type="number" min="0" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="25500" />
      </label>
      <label className="adm-form-field">
        Descripción
        <textarea value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Ingredientes principales..." />
      </label>
      <label className="adm-form-field">
        Ingredientes (separados por coma)
        <input value={ingredients} onChange={(e) => setIngredients(e.target.value)} placeholder="Carne, Queso, Lechuga" />
      </label>
      {category === "combos" && (
        <label className="adm-form-field">
          Hamburguesa incluida
          <input value={burger} onChange={(e) => setBurger(e.target.value)} placeholder="Nombre exacto de la hamburguesa" />
        </label>
      )}
      {category === "bebidas" && (
        <label className="adm-form-field">
          Sobrecosto en combo (opcional)
          <input type="number" min="0" value={comboExtra} onChange={(e) => setComboExtra(e.target.value)} placeholder="5000" />
        </label>
      )}
      <div className="adm-form-checks">
        <label className="adm-form-check">
          <input type="checkbox" checked={allowCustomization} onChange={(e) => setAllowCustomization(e.target.checked)} />
          Permite personalizar ingredientes/adiciones
        </label>
        <label className="adm-form-check">
          <input type="checkbox" checked={isNew} onChange={(e) => setIsNew(e.target.checked)} />
          Marcar como "Nuevo"
        </label>
        <label className="adm-form-check">
          <input type="checkbox" checked={popular} onChange={(e) => setPopular(e.target.checked)} />
          Marcar como "Popular"
        </label>
        <label className="adm-form-check">
          <input type="checkbox" checked={specialEdition} onChange={(e) => setSpecialEdition(e.target.checked)} />
          Edición especial (destacada con banner, como "Cali Vibes")
        </label>
      </div>
      <div className="adm-form-field">
        Foto del producto (opcional)
        <input type="file" accept="image/*" onChange={handleImageChange} />
        {imageBusy && <p className="adm-image-hint">Procesando imagen...</p>}
        {imageError && <p className="adm-form-error">{imageError}</p>}
        {burgerImg && (
          <div className="adm-image-preview-wrap">
            <ImageFrameEditor src={burgerImg} x={imgPosition.x} y={imgPosition.y} zoom={imgPosition.zoom} onChange={setImgPosition} />
            <button type="button" className="adm-btn-ghost adm-btn-sm" onClick={() => setBurgerImg(null)}>Quitar imagen</button>
          </div>
        )}
      </div>
      {error && <p className="adm-form-error">{error}</p>}
      <div className="adm-form-actions">
        <button type="button" className="adm-btn-ghost" onClick={onCancel}>Cancelar</button>
        <button type="submit" className="adm-btn-primary" disabled={saving}>
          {saving ? <><span className="adm-btn-spinner" /> Guardando...</> : "Guardar"}
        </button>
      </div>
    </form>
  );
}

// ─── ADMINISTRACIÓN DE MENÚ ────────────────────────────────────────────────
function MenuManager({ menuData, categories, reload }) {
  const [editingItem, setEditingItem] = useState(null);
  const [deletingItem, setDeletingItem] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState("");
  const [toast, setToast] = useState(null);

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2200);
  };

  const handleCreate = async (payload) => {
    await api("/api/menu", { method: "POST", body: JSON.stringify(payload) });
    setEditingItem(null);
    reload();
    showToast("Producto creado");
  };

  const handleUpdate = async (id, payload) => {
    await api(`/api/menu/${id}`, { method: "PUT", body: JSON.stringify(payload) });
    setEditingItem(null);
    reload();
    showToast("Producto actualizado");
  };

  const toggleActive = async (item) => {
    setBusyId(item.id);
    setError("");
    try {
      const willActivate = item.isActive === false;
      await api(`/api/menu/${item.id}`, { method: "PATCH", body: JSON.stringify({ isActive: willActivate }) });
      reload();
      showToast(willActivate ? "Producto activado" : "Producto desactivado");
    } catch (err) {
      setError(err.message || "No se pudo actualizar");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <>
      {editingItem ? (
        <div className="adm-section">
          <div className="adm-section-title">{editingItem.id ? `Editar: ${editingItem.name}` : "Nuevo producto"}</div>
          <ProductForm
            initial={editingItem.id ? editingItem : null}
            categories={categories}
            onSubmit={(payload) => (editingItem.id ? handleUpdate(editingItem.id, payload) : handleCreate(payload))}
            onCancel={() => setEditingItem(null)}
          />
        </div>
      ) : (
        <div className="adm-section">
          <div className="adm-section-title">
            Menú
            <button className="adm-btn-primary adm-btn-sm" onClick={() => setEditingItem({})}>+ Nuevo producto</button>
          </div>
          {error && <p className="adm-form-error">{error}</p>}
          {categories.map((cat) => (
            <div key={cat.id} className="adm-menu-category">
              <div className="adm-menu-category-title">{cat.icon} {cat.label}</div>
              {(menuData[cat.id] || []).length === 0 && (
                <p className="adm-menu-empty">Sin productos en esta categoría.</p>
              )}
              {(menuData[cat.id] || []).map((item) => (
                <div key={item.id} className={`adm-menu-row ${item.isActive === false ? "inactive" : ""}`}>
                  <div className="adm-menu-row-info">
                    <div className="adm-menu-row-name">
                      {item.name}
                      {item.special && <span className="adm-special-tag">🎉 Especial</span>}
                      {item.isNew && <span className="new-tag">Nuevo</span>}
                      {item.popular && <span className="popular-tag">Popular</span>}
                      {item.isActive === false && <span className="adm-inactive-tag">Desactivado</span>}
                    </div>
                    <div className="adm-menu-row-price">{fmt(item.price)}</div>
                  </div>
                  <div className="adm-menu-row-actions">
                    <button className="adm-btn-ghost adm-btn-sm" onClick={() => setEditingItem({ ...item, category: cat.id })}>Editar</button>
                    <button className="adm-btn-ghost adm-btn-sm" disabled={busyId === item.id} onClick={() => toggleActive(item)}>
                      {item.isActive === false ? "Activar" : "Desactivar"}
                    </button>
                    <button className="adm-btn-ghost adm-btn-sm adm-btn-danger-ghost" onClick={() => setDeletingItem(item)}>
                      Eliminar
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
      {deletingItem && (
        <DeleteConfirmModal
          title="Eliminar producto"
          message={`¿Eliminar "${deletingItem.name}" del menú? Esta acción no se puede deshacer.`}
          onClose={() => setDeletingItem(null)}
          onConfirm={async (pin) => {
            await api(`/api/menu/${deletingItem.id}`, { method: "DELETE", body: JSON.stringify({ pin }) });
            setDeletingItem(null);
            reload();
            showToast("Producto eliminado");
          }}
        />
      )}
      {toast && <div className="adm-toast">✓ {toast}</div>}
    </>
  );
}

// ─── FORMULARIO DE ZONA DE DOMICILIO ───────────────────────────────────────
function DeliveryLocationForm({ initial, onSubmit, onCancel }) {
  const [name, setName] = useState(initial?.name || "");
  const [price, setPrice] = useState(initial?.price ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    if (!name.trim() || price === "") {
      setError("Nombre y precio son obligatorios");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await onSubmit({ name: name.trim(), price: Number(price) });
    } catch (err) {
      setError(err.message || "No se pudo guardar");
      setSaving(false);
    }
  };

  return (
    <form className="adm-product-form" onSubmit={submit}>
      <label className="adm-form-field">
        Nombre de la zona
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej: Ciudad Country" />
      </label>
      <label className="adm-form-field">
        Costo de domicilio
        <input type="number" min="0" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="5000" />
      </label>
      {error && <p className="adm-form-error">{error}</p>}
      <div className="adm-form-actions">
        <button type="button" className="adm-btn-ghost" onClick={onCancel}>Cancelar</button>
        <button type="submit" className="adm-btn-primary" disabled={saving}>
          {saving ? <><span className="adm-btn-spinner" /> Guardando...</> : "Guardar"}
        </button>
      </div>
    </form>
  );
}

// ─── ADMINISTRACIÓN DE ZONAS DE DOMICILIO ──────────────────────────────────
function DeliveryManager({ locations, reload }) {
  const [editingItem, setEditingItem] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState("");
  const [toast, setToast] = useState(null);

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2200);
  };

  const handleCreate = async (payload) => {
    await api("/api/delivery-locations", { method: "POST", body: JSON.stringify(payload) });
    setEditingItem(null);
    reload();
    showToast("Zona creada");
  };

  const handleUpdate = async (id, payload) => {
    await api(`/api/delivery-locations/${id}`, { method: "PUT", body: JSON.stringify(payload) });
    setEditingItem(null);
    reload();
    showToast("Zona actualizada");
  };

  const toggleActive = async (loc) => {
    setBusyId(loc.id);
    setError("");
    try {
      const willActivate = loc.isActive === false;
      await api(`/api/delivery-locations/${loc.id}`, { method: "PATCH", body: JSON.stringify({ isActive: willActivate }) });
      reload();
      showToast(willActivate ? "Zona activada" : "Zona desactivada");
    } catch (err) {
      setError(err.message || "No se pudo actualizar");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <>
      {editingItem ? (
        <div className="adm-section">
          <div className="adm-section-title">{editingItem.id ? `Editar: ${editingItem.name}` : "Nueva zona de domicilio"}</div>
          <DeliveryLocationForm
            initial={editingItem.id ? editingItem : null}
            onSubmit={(payload) => (editingItem.id ? handleUpdate(editingItem.id, payload) : handleCreate(payload))}
            onCancel={() => setEditingItem(null)}
          />
        </div>
      ) : (
        <div className="adm-section">
          <div className="adm-section-title">
            Zonas de domicilio
            <button className="adm-btn-primary adm-btn-sm" onClick={() => setEditingItem({})}>+ Nueva zona</button>
          </div>
          {error && <p className="adm-form-error">{error}</p>}
          {locations.length === 0 && <p className="adm-menu-empty">Sin zonas de domicilio.</p>}
          {locations.map((loc) => (
            <div key={loc.id} className={`adm-menu-row ${loc.isActive === false ? "inactive" : ""}`}>
              <div className="adm-menu-row-info">
                <div className="adm-menu-row-name">
                  {loc.name}
                  {loc.isActive === false && <span className="adm-inactive-tag">Desactivado</span>}
                </div>
                <div className="adm-menu-row-price">{fmt(loc.price)}</div>
              </div>
              <div className="adm-menu-row-actions">
                <button className="adm-btn-ghost adm-btn-sm" onClick={() => setEditingItem(loc)}>Editar</button>
                <button className="adm-btn-ghost adm-btn-sm" disabled={busyId === loc.id} onClick={() => toggleActive(loc)}>
                  {loc.isActive === false ? "Activar" : "Desactivar"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      {toast && <div className="adm-toast">✓ {toast}</div>}
    </>
  );
}

// ─── FORMULARIO DE CATEGORÍA ────────────────────────────────────────────────
function CategoryForm({ initial, onSubmit, onCancel }) {
  const [label, setLabel] = useState(initial?.label || "");
  const [icon, setIcon] = useState(initial?.icon || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    if (!label.trim()) {
      setError("El nombre es obligatorio");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await onSubmit({ label: label.trim(), icon: icon.trim() });
    } catch (err) {
      setError(err.message || "No se pudo guardar");
      setSaving(false);
    }
  };

  return (
    <form className="adm-product-form" onSubmit={submit}>
      <label className="adm-form-field">
        Nombre de la categoría
        <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Ej: Postres" />
      </label>
      <label className="adm-form-field">
        Ícono (emoji)
        <input value={icon} onChange={(e) => setIcon(e.target.value)} placeholder="🍰" maxLength={4} />
      </label>
      {error && <p className="adm-form-error">{error}</p>}
      <div className="adm-form-actions">
        <button type="button" className="adm-btn-ghost" onClick={onCancel}>Cancelar</button>
        <button type="submit" className="adm-btn-primary" disabled={saving}>
          {saving ? <><span className="adm-btn-spinner" /> Guardando...</> : "Guardar"}
        </button>
      </div>
    </form>
  );
}

// ─── ADMINISTRACIÓN DE CATEGORÍAS ───────────────────────────────────────────
// Las 5 categorías originales sostienen lógica de negocio propia (combos,
// adiciones/bebidas de agregado rápido) — se pueden renombrar/reordenar/
// desactivar, pero no eliminar (el backend también lo bloquea).
const BUILTIN_CATEGORY_IDS = ["hamburguesas", "tenders", "combos", "adiciones", "bebidas"];

function CategoryManager({ categories, reload }) {
  const [editingItem, setEditingItem] = useState(null);
  const [deletingItem, setDeletingItem] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState("");
  const [toast, setToast] = useState(null);

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2200);
  };

  const handleCreate = async (payload) => {
    await api("/api/categories", { method: "POST", body: JSON.stringify(payload) });
    setEditingItem(null);
    reload();
    showToast("Categoría creada");
  };

  const handleUpdate = async (id, payload) => {
    await api(`/api/categories/${id}`, { method: "PUT", body: JSON.stringify(payload) });
    setEditingItem(null);
    reload();
    showToast("Categoría actualizada");
  };

  const toggleActive = async (cat) => {
    setBusyId(cat.id);
    setError("");
    try {
      const willActivate = cat.isActive === false;
      await api(`/api/categories/${cat.id}`, { method: "PATCH", body: JSON.stringify({ isActive: willActivate }) });
      reload();
      showToast(willActivate ? "Categoría activada" : "Categoría desactivada");
    } catch (err) {
      setError(err.message || "No se pudo actualizar");
    } finally {
      setBusyId(null);
    }
  };

  const move = async (index, direction) => {
    const other = index + direction;
    if (other < 0 || other >= categories.length) return;
    const a = categories[index];
    const b = categories[other];
    setBusyId(a.id);
    setError("");
    try {
      await Promise.all([
        api(`/api/categories/${a.id}`, { method: "PUT", body: JSON.stringify({ sortOrder: other }) }),
        api(`/api/categories/${b.id}`, { method: "PUT", body: JSON.stringify({ sortOrder: index }) }),
      ]);
      reload();
    } catch (err) {
      setError(err.message || "No se pudo reordenar");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <>
      {editingItem ? (
        <div className="adm-section">
          <div className="adm-section-title">{editingItem.id ? `Editar: ${editingItem.label}` : "Nueva categoría"}</div>
          <CategoryForm
            initial={editingItem.id ? editingItem : null}
            onSubmit={(payload) => (editingItem.id ? handleUpdate(editingItem.id, payload) : handleCreate(payload))}
            onCancel={() => setEditingItem(null)}
          />
        </div>
      ) : (
        <div className="adm-section">
          <div className="adm-section-title">
            Categorías del menú
            <button className="adm-btn-primary adm-btn-sm" onClick={() => setEditingItem({})}>+ Nueva categoría</button>
          </div>
          {error && <p className="adm-form-error">{error}</p>}
          {categories.length === 0 && <p className="adm-menu-empty">Sin categorías.</p>}
          {categories.map((cat, i) => (
            <div key={cat.id} className={`adm-menu-row ${cat.isActive === false ? "inactive" : ""}`}>
              <div className="adm-menu-row-info">
                <div className="adm-menu-row-name">
                  {cat.icon} {cat.label}
                  {cat.isActive === false && <span className="adm-inactive-tag">Desactivado</span>}
                </div>
              </div>
              <div className="adm-menu-row-actions">
                <button
                  className="adm-btn-ghost adm-btn-sm"
                  disabled={i === 0 || busyId === cat.id}
                  onClick={() => move(i, -1)}
                  title="Subir"
                >↑</button>
                <button
                  className="adm-btn-ghost adm-btn-sm"
                  disabled={i === categories.length - 1 || busyId === cat.id}
                  onClick={() => move(i, 1)}
                  title="Bajar"
                >↓</button>
                <button className="adm-btn-ghost adm-btn-sm" onClick={() => setEditingItem(cat)}>Editar</button>
                <button className="adm-btn-ghost adm-btn-sm" disabled={busyId === cat.id} onClick={() => toggleActive(cat)}>
                  {cat.isActive === false ? "Activar" : "Desactivar"}
                </button>
                <button
                  className="adm-btn-ghost adm-btn-sm adm-btn-danger-ghost"
                  disabled={BUILTIN_CATEGORY_IDS.includes(cat.id)}
                  title={BUILTIN_CATEGORY_IDS.includes(cat.id) ? "Esta categoría es del sistema y no se puede eliminar" : ""}
                  onClick={() => setDeletingItem(cat)}
                >
                  Eliminar
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      {deletingItem && (
        <DeleteConfirmModal
          title="Eliminar categoría"
          message={`¿Eliminar la categoría "${deletingItem.label}"? Esta acción no se puede deshacer.`}
          onClose={() => setDeletingItem(null)}
          onConfirm={async (pin) => {
            await api(`/api/categories/${deletingItem.id}`, { method: "DELETE", body: JSON.stringify({ pin }) });
            setDeletingItem(null);
            reload();
            showToast("Categoría eliminada");
          }}
        />
      )}
      {toast && <div className="adm-toast">✓ {toast}</div>}
    </>
  );
}

// ─── CAMPO DE CONTRASEÑA CON OJITO ──────────────────────────────────────────
function PasswordField({ label, value, onChange, autoFocus, inputId, maxLength, numeric }) {
  const [visible, setVisible] = useState(false);
  return (
    <label className="adm-form-field" htmlFor={inputId}>
      {label}
      <div className="adm-password-wrap">
        <input
          id={inputId}
          type={visible ? "text" : "password"}
          value={value}
          onChange={onChange}
          autoFocus={autoFocus}
          maxLength={maxLength}
          inputMode={numeric ? "numeric" : undefined}
          pattern={numeric ? "[0-9]*" : undefined}
        />
        <button
          type="button"
          className="adm-password-toggle"
          onClick={() => setVisible((v) => !v)}
          tabIndex={-1}
          aria-label={visible ? "Ocultar contraseña" : "Mostrar contraseña"}
        >
          {visible ? <IconEyeOff /> : <IconEye />}
        </button>
      </div>
    </label>
  );
}

// ─── CAMBIAR CONTRASEÑA ─────────────────────────────────────────────────────
function ChangePasswordModal({ onClose }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [saving, setSaving] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    if (!currentPassword || !newPassword || !confirmPassword) {
      setError("Completa los 3 campos");
      return;
    }
    if (newPassword.length < 6) {
      setError("La nueva contraseña debe tener al menos 6 caracteres");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("La confirmación no coincide con la nueva contraseña");
      return;
    }
    setSaving(true);
    try {
      await api("/api/admin/change-password", {
        method: "POST",
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      setSuccess(true);
      setTimeout(onClose, 1500);
    } catch (err) {
      setError(err.message || "No se pudo cambiar la contraseña");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="adm-modal-overlay" onClick={onClose}>
      <div className="adm-modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="adm-section-title">🔑 Cambiar contraseña</div>
        {success ? (
          <p className="adm-modal-success">✓ Contraseña actualizada</p>
        ) : (
          <form className="adm-product-form" onSubmit={submit}>
            <PasswordField
              inputId="current-password"
              label="Contraseña actual"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              autoFocus
            />
            <PasswordField
              inputId="new-password"
              label="Nueva contraseña"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
            <PasswordField
              inputId="confirm-password"
              label="Confirmar nueva contraseña"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
            {error && <p className="adm-form-error">{error}</p>}
            <div className="adm-form-actions">
              <button type="button" className="adm-btn-ghost" onClick={onClose}>Cancelar</button>
              <button type="submit" className="adm-btn-primary" disabled={saving}>
                {saving ? <><span className="adm-btn-spinner" /> Guardando...</> : "Guardar"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

// ─── IMPRESORAS BLUETOOTH ───────────────────────────────────────────────────
function BluetoothPrintersModal({ onClose }) {
  const [printers, setPrinters] = useState(() => getLinkedPrinters());
  const [newLabel, setNewLabel] = useState("");
  const [linking, setLinking] = useState(false);
  const [error, setError] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editingLabel, setEditingLabel] = useState("");
  const supported = isBluetoothPrintingSupported();

  const handleLink = async () => {
    setError("");
    setLinking(true);
    try {
      await linkNewPrinter(newLabel);
      setNewLabel("");
      setPrinters(getLinkedPrinters());
    } catch (err) {
      // El usuario cancelando el selector también cae acá (no es un error real)
      if (err?.name !== "NotFoundError") {
        setError(err.message || "No se pudo vincular la impresora");
      }
    } finally {
      setLinking(false);
    }
  };

  const handleUnlink = (id) => {
    unlinkPrinter(id);
    setPrinters(getLinkedPrinters());
  };

  // Recupera la conexión sin tener que quitar la impresora y escribir la
  // etiqueta de nuevo — pasa esto cuando sale "sin permiso persistente"
  // (ej. después de recargar la página) o simplemente para refrescarla.
  const handleReconnect = async (printer) => {
    setError("");
    setLinking(true);
    try {
      await linkNewPrinter(printer.label);
      setPrinters(getLinkedPrinters());
    } catch (err) {
      if (err?.name !== "NotFoundError") {
        setError(err.message || "No se pudo reconectar la impresora");
      }
    } finally {
      setLinking(false);
    }
  };

  const startEditing = (p) => {
    setEditingId(p.id);
    setEditingLabel(p.label);
  };

  const saveLabel = () => {
    renamePrinter(editingId, editingLabel);
    setPrinters(getLinkedPrinters());
    setEditingId(null);
  };

  return (
    <div className="adm-modal-overlay" onClick={onClose}>
      <div className="adm-modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="adm-section-title">🖨️ Impresoras Bluetooth</div>
        {!supported ? (
          <p className="adm-form-error">
            Este navegador no soporta impresión directa por Bluetooth. Prueba con Chrome o Brave en Android.
          </p>
        ) : (
          <>
            <p style={{ fontSize: "13px", opacity: 0.8, marginBottom: "12px" }}>
              Cada impresora queda vinculada a este dispositivo/navegador (el Bluetooth es de corto alcance).
              Ponle una etiqueta a cada una (ej. "Cocina", "Caja") — al imprimir una comanda podrás elegir a
              cuál mandarla, o mandarla a todas a la vez.
            </p>
            {printers.length === 0 ? (
              <p style={{ opacity: 0.7 }}>Todavía no has vinculado ninguna.</p>
            ) : (
              <ul style={{ listStyle: "none", padding: 0, margin: "0 0 12px" }}>
                {printers.map((p) => (
                  <li key={p.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid var(--border-color, #333)" }}>
                    {editingId === p.id ? (
                      <input
                        type="text"
                        value={editingLabel}
                        autoFocus
                        onChange={(e) => setEditingLabel(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && saveLabel()}
                        onBlur={saveLabel}
                        style={{ flex: 1, marginRight: "8px" }}
                      />
                    ) : (
                      <span onClick={() => startEditing(p)} style={{ cursor: "pointer" }} title="Clic para renombrar">
                        🖨️ {p.label} <small style={{ opacity: 0.6 }}>({p.name})</small>
                      </span>
                    )}
                    <div style={{ display: "flex", gap: "6px" }}>
                      <button type="button" className="adm-btn-ghost" onClick={() => handleReconnect(p)} disabled={linking} title="Si sale 'sin permiso persistente', dale acá">
                        🔄 Reconectar
                      </button>
                      <button type="button" className="adm-btn-ghost" onClick={() => handleUnlink(p.id)}>Quitar</button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {error && <p className="adm-form-error">{error}</p>}
            <div className="adm-product-form" style={{ marginBottom: "8px" }}>
              <label htmlFor="new-printer-label">Etiqueta para la nueva impresora</label>
              <input
                id="new-printer-label"
                type="text"
                placeholder="ej. Cocina"
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
              />
            </div>
            <div className="adm-form-actions">
              <button type="button" className="adm-btn-ghost" onClick={onClose}>Cerrar</button>
              <button type="button" className="adm-btn-primary" onClick={handleLink} disabled={linking}>
                {linking ? <><span className="adm-btn-spinner" /> Buscando...</> : "+ Vincular impresora"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── CAMBIAR PIN DE ELIMINACIÓN ─────────────────────────────────────────────
function ChangeDeletePinModal({ onClose }) {
  const [currentPin, setCurrentPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [saving, setSaving] = useState(false);
  const onlyDigits = (v) => v.replace(/\D/g, "").slice(0, 4);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    if (!currentPin || !newPin || !confirmPin) {
      setError("Completa los 3 campos");
      return;
    }
    if (newPin.length !== 4) {
      setError("El nuevo PIN debe tener exactamente 4 dígitos");
      return;
    }
    if (newPin !== confirmPin) {
      setError("La confirmación no coincide con el nuevo PIN");
      return;
    }
    setSaving(true);
    try {
      await api("/api/admin/change-delete-pin", {
        method: "POST",
        body: JSON.stringify({ currentPin, newPin }),
      });
      setSuccess(true);
      setTimeout(onClose, 1500);
    } catch (err) {
      setError(err.message || "No se pudo cambiar el PIN");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="adm-modal-overlay" onClick={onClose}>
      <div className="adm-modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="adm-section-title">🗑️ Cambiar clave de eliminación</div>
        {success ? (
          <p className="adm-modal-success">✓ PIN actualizado</p>
        ) : (
          <form className="adm-product-form" onSubmit={submit}>
            <PasswordField
              inputId="current-pin"
              label="PIN actual (4 dígitos)"
              value={currentPin}
              onChange={(e) => setCurrentPin(onlyDigits(e.target.value))}
              maxLength={4}
              numeric
              autoFocus
            />
            <PasswordField
              inputId="new-pin"
              label="Nuevo PIN (4 dígitos)"
              value={newPin}
              onChange={(e) => setNewPin(onlyDigits(e.target.value))}
              maxLength={4}
              numeric
            />
            <PasswordField
              inputId="confirm-pin"
              label="Confirmar nuevo PIN"
              value={confirmPin}
              onChange={(e) => setConfirmPin(onlyDigits(e.target.value))}
              maxLength={4}
              numeric
            />
            {error && <p className="adm-form-error">{error}</p>}
            <div className="adm-form-actions">
              <button type="button" className="adm-btn-ghost" onClick={onClose}>Cancelar</button>
              <button type="submit" className="adm-btn-primary" disabled={saving}>
                {saving ? <><span className="adm-btn-spinner" /> Guardando...</> : "Guardar"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

// ─── ELIMINAR PEDIDO ─────────────────────────────────────────────────────────
// { title, message, onClose, onConfirm(pin) } — onConfirm hace la llamada a la
// API correspondiente (pedido/producto/categoría) y lanza si falla; el modal
// solo se encarga de pedir el PIN y mostrar el error.
function DeleteConfirmModal({ title, message, onClose, onConfirm }) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [deleting, setDeleting] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    if (pin.length !== 4) {
      setError("El PIN debe tener 4 dígitos");
      return;
    }
    setDeleting(true);
    try {
      await onConfirm(pin);
    } catch (err) {
      setError(err.message || "No se pudo eliminar");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="adm-modal-overlay" onClick={onClose}>
      <div className="adm-modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="adm-section-title">🗑️ {title}</div>
        <p className="adm-modal-warning">{message}</p>
        <form className="adm-product-form" onSubmit={submit}>
          <PasswordField
            inputId="delete-confirm-pin"
            label="Clave de eliminación (4 dígitos)"
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
            maxLength={4}
            numeric
            autoFocus
          />
          {error && <p className="adm-form-error">{error}</p>}
          <div className="adm-form-actions">
            <button type="button" className="adm-btn-ghost" onClick={onClose}>Cancelar</button>
            <button type="submit" className="adm-btn-danger" disabled={deleting}>
              {deleting ? <><span className="adm-btn-spinner" /> Eliminando...</> : "Eliminar"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── ADMIN DASHBOARD ───────────────────────────────────────────────────────
export default function AdminDashboard() {
  const [theme, setTheme] = useState(() => localStorage.getItem("adm-theme") || "dark");
  useEffect(() => {
    localStorage.setItem("adm-theme", theme);
  }, [theme]);

  const [toast, setToast] = useState(null);
  const showToast = (msg, duration = 2200) => {
    setToast(msg);
    setTimeout(() => setToast(null), duration);
  };

  // target: id de una impresora vinculada, "all" (todas las vinculadas), o
  // "none" (no hay ninguna vinculada todavía).
  const handlePrintComanda = async (order, target) => {
    if (target === "none") {
      showToast("⚠ Primero vincula o sincroniza una impresora (Perfil → Impresoras Bluetooth)", 5000);
      return;
    }
    const bytes = buildComandaEscPos(order);
    try {
      if (target === "all") {
        const results = await printToAllPrinters(bytes);
        showToast(results.map((r) => `${r.ok ? "✓" : "⚠"} ${r.label}`).join(" · "), 5000);
      } else {
        await printToPrinter(target, bytes);
        showToast("✓ Comanda enviada a la impresora");
      }
    } catch (err) {
      showToast(`⚠ No se pudo imprimir: ${err.message}`, 5000);
    }
  };

  // Botón flotante "volver arriba" — aparece cuando ya se hizo bastante scroll,
  // útil en listas largas como Menú o Pedidos.
  const [showScrollTop, setShowScrollTop] = useState(false);
  useEffect(() => {
    const onScroll = () => setShowScrollTop(window.scrollY > 400);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  const scrollToTop = () => window.scrollTo({ top: 0, behavior: "smooth" });

  const [authState, setAuthState] = useState("checking"); // checking | locked | unlocked
  const [pinInput, setPinInput] = useState("");
  const [pinError, setPinError] = useState(false);
  const [pinVisible, setPinVisible] = useState(false);
  const [tab, setTab] = useState("resumen");
  const [orders, setOrders] = useState([]);
  const [menuData, setMenuData] = useState({});
  const [locations, setLocations] = useState([]);
  const [categories, setCategories] = useState([]);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [showChangeDeletePin, setShowChangeDeletePin] = useState(false);
  const [showBluetoothPrinters, setShowBluetoothPrinters] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [logoError, setLogoError] = useState(false);
  const [deletingOrder, setDeletingOrder] = useState(null);
  const [newOrderAlert, setNewOrderAlert] = useState(null);
  const [highlightOrderId, setHighlightOrderId] = useState(null);
  const knownOrderIdsRef = useRef(null);
  const loadingOrdersRef = useRef(false);
  const alertIntervalRef = useRef(null);
  const audioCtxRef = useRef(null);

  // Crear/retomar el AudioContext fuera de un gesto real del usuario (ej. desde
  // el setInterval que revisa pedidos nuevos) hace que varios navegadores lo
  // dejen "suspended" para siempre y el pitido nunca suene, aunque sí llegue
  // la notificación del sistema. Por eso esto se llama también desde un
  // listener de "primer clic" más abajo, no solo desde playPagerBeep.
  const ensureAudioContext = useCallback(() => {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return null;
      if (!audioCtxRef.current) audioCtxRef.current = new AudioCtx();
      if (audioCtxRef.current.state === "suspended") audioCtxRef.current.resume().catch(() => {});
      return audioCtxRef.current;
    } catch {
      // Algunos navegadores móviles bloquean por política de autoplay crear o
      // reanudar audio si no viene de un toque directo del usuario (acá se
      // llama también desde el sondeo automático). Sin este try/catch, ese
      // bloqueo lanzaba un error que interrumpía loadOrders a mitad de camino
      // — el pedido nunca se guardaba como "ya visto" y la alerta volvía a
      // sonar en cada sondeo siguiente, sin parar, solo en celulares.
      return null;
    }
  }, []);

  // Beep tipo localizador (3 pitidos cortos) generado con Web Audio API, sin
  // depender de ningún archivo de audio externo.
  const playPagerBeep = useCallback(() => {
    try {
      const ctx = ensureAudioContext();
      if (!ctx) return;
      const now = ctx.currentTime;
      [0, 0.22, 0.44].forEach((offset) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "square";
        osc.frequency.value = 1300;
        gain.gain.setValueAtTime(0.35, now + offset);
        gain.gain.exponentialRampToValueAtTime(0.001, now + offset + 0.18);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + offset);
        osc.stop(now + offset + 0.2);
      });
    } catch {
      // Ver comentario en ensureAudioContext: un fallo de audio nunca debe
      // impedir que el pedido se marque como "ya visto".
    }
  }, [ensureAudioContext]);

  const stopAlertSound = useCallback(() => {
    if (alertIntervalRef.current) {
      clearInterval(alertIntervalRef.current);
      alertIntervalRef.current = null;
    }
  }, []);

  // Punto único para "ya vi este pedido nuevo", sin importar si el admin lo
  // reconoce desde el banner interno o desde la notificación del navegador —
  // ambos deben apagar el sonido y cerrar el banner de la misma forma.
  const acknowledgeNewOrder = useCallback((orderId) => {
    stopAlertSound();
    setNewOrderAlert(null);
    if (orderId) setHighlightOrderId(orderId);
    setTab("pedidos");
  }, [stopAlertSound]);

  const dismissNewOrderAlert = () => {
    acknowledgeNewOrder(newOrderAlert?.orders?.[0]?.id);
  };

  useEffect(() => stopAlertSound, [stopAlertSound]);

  // Notificaciones del navegador (aparecen aunque la pestaña no esté activa).
  // "unsupported" cubre navegadores sin Notification API (ej. Safari en iPhone).
  const [notifPermission, setNotifPermission] = useState(
    typeof Notification !== "undefined" ? Notification.permission : "unsupported"
  );

  // Suscribe este dispositivo a Web Push real: así llegan las notificaciones
  // aunque el navegador esté minimizado o en otra app (no depende de que
  // esta pestaña esté corriendo un sondeo). Se puede llamar varias veces sin
  // problema — el navegador devuelve la misma suscripción si ya existía.
  const subscribeToPush = useCallback(async () => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
    try {
      const reg = await navigator.serviceWorker.ready;
      const { publicKey } = await api("/api/push/public-key");
      if (!publicKey) return; // llaves VAPID no configuradas en este entorno
      const subscription = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
      await api("/api/push/subscribe", { method: "POST", body: JSON.stringify(subscription.toJSON()) });
    } catch {
      // Sin push real, igual queda el sonido/banner mientras la pestaña esté
      // abierta — no es un fallo crítico.
    }
  }, []);

  const requestNotificationPermission = () => {
    if (typeof Notification === "undefined") return;
    Notification.requestPermission().then((perm) => {
      setNotifPermission(perm);
      if (perm === "granted") subscribeToPush();
    });
  };

  // En Android, la mayoría de navegadores no soportan crear notificaciones
  // directamente desde el código de la página (`new Notification(...)`) —
  // el permiso se concede pero nunca aparece nada. Solo lo permiten a través
  // de un service worker (`registration.showNotification`), por eso se
  // registra uno (public/sw.js) apenas se desbloquea el panel.
  useEffect(() => {
    if (authState !== "unlocked" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").then(() => {
      // Si el permiso ya se había concedido en una sesión anterior, hay que
      // renovar/confirmar la suscripción push en cada carga (puede haber
      // expirado, o ser la primera vez que corre este código en el
      // dispositivo aunque el permiso ya estuviera dado desde antes).
      if (typeof Notification !== "undefined" && Notification.permission === "granted") {
        subscribeToPush();
      }
    }).catch(() => {});
  }, [authState, subscribeToPush]);

  // Cuando el admin toca la notificación del sistema (que vive en el service
  // worker, no en esta pestaña), este mensaje es cómo nos enteramos acá para
  // apagar el sonido y abrir el pedido — igual que el clic en el banner interno.
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const onMessage = (event) => {
      if (event.data?.type === "notification-click") {
        window.focus();
        acknowledgeNewOrder(event.data.orderId);
      }
    };
    navigator.serviceWorker.addEventListener("message", onMessage);
    return () => navigator.serviceWorker.removeEventListener("message", onMessage);
  }, [acknowledgeNewOrder]);

  const notifyNewOrder = useCallback((order) => {
    try {
      if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
      const options = {
        body: `${order.customerName} · ${fmt(order.total)}`,
        icon: "/logo.png",
        tag: `order-${order.id}`,
        data: { orderId: order.id },
      };
      if ("serviceWorker" in navigator) {
        navigator.serviceWorker.ready.then((reg) => reg.showNotification("🔔 Nuevo pedido — Cómo Sería", options)).catch(() => {});
        return;
      }
      // Respaldo para navegadores sin service worker (ej. desktop más viejo):
      // acá sí funciona el método directo.
      const notification = new Notification("🔔 Nuevo pedido — Cómo Sería", options);
      notification.onclick = () => {
        window.focus();
        acknowledgeNewOrder(order.id);
        notification.close();
      };
    } catch {
      // Un fallo al crear la notificación (ej. permiso revocado a mitad de
      // sesión) nunca debe impedir que el pedido se marque como "ya visto".
    }
  }, [acknowledgeNewOrder]);

  const [exportingOrdersPdf, setExportingOrdersPdf] = useState(false);
  const [exportingSummaryPdf, setExportingSummaryPdf] = useState(false);
  const [rangePreset, setRangePreset] = useState("hoy");
  const [customFrom, setCustomFrom] = useState(getTodayKey());
  const [customTo, setCustomTo] = useState(getTodayKey());

  const range = computeRange(rangePreset, customFrom, customTo);
  const filteredOrders = orders.filter((o) => !range.from || (o.date >= range.from && o.date <= range.to));
  const exportLabel = rangeFilenameLabel(rangePreset, range);

  const handleExportOrdersPDF = async () => {
    setExportingOrdersPdf(true);
    try {
      await exportPDF(filteredOrders, exportLabel);
    } catch {
      // si falla (ej. no se pudo cargar el logo), el usuario puede reintentar
    } finally {
      setExportingOrdersPdf(false);
    }
  };

  useEffect(() => {
    api("/api/admin/me")
      .then((d) => setAuthState(d.authenticated ? "unlocked" : "locked"))
      .catch(() => setAuthState("locked"));
  }, []);

  // La mayoría de las veces la sesión ya está iniciada (cookie persistida), así
  // que nunca se pasa por el formulario de PIN — hay que aprovechar el primer
  // clic real dentro del panel para "despertar" el audio, o el pitido de
  // pedido nuevo puede quedar mudo en algunos navegadores aunque la
  // notificación del sistema sí llegue.
  useEffect(() => {
    if (authState !== "unlocked") return;
    const warmUpAudio = () => ensureAudioContext();
    document.addEventListener("pointerdown", warmUpAudio, { once: true });
    return () => document.removeEventListener("pointerdown", warmUpAudio);
  }, [authState, ensureAudioContext]);

  const loadOrders = useCallback(() => {
    // En redes lentas (móviles/tablets) una petición puede tardar más de los
    // 7s del intervalo; sin esta guarda, dos peticiones podían quedar
    // "en el aire" al mismo tiempo y cada una detectaba el mismo pedido como
    // nuevo, duplicando/triplicando la alerta (sonido + notificación) para
    // un único pedido real.
    if (loadingOrdersRef.current) return;
    loadingOrdersRef.current = true;
    api("/api/orders").then((d) => {
      const mapped = (d.orders || []).map(mapOrderRow);
      setOrders(mapped);

      // En celulares, el sistema operativo suele "matar" la pestaña en segundo
      // plano (pantalla bloqueada / cambio de app) para ahorrar memoria; al
      // volver, el navegador la recarga por dentro sin que se note visualmente
      // — eso borraba esta lista si solo vivía en memoria (useRef), haciendo
      // que la misma alerta reapareciera sin parar. Por eso se guarda también
      // en localStorage: si el ref en memoria se perdió pero el navegador
      // sigue siendo el mismo, se recupera de ahí en vez de tratarlo como si
      // fuera la primera vez.
      if (!knownOrderIdsRef.current) {
        try {
          const raw = localStorage.getItem(KNOWN_ORDER_IDS_KEY);
          knownOrderIdsRef.current = raw ? new Set(JSON.parse(raw)) : null;
        } catch {
          knownOrderIdsRef.current = null;
        }
      }

      // Solo alertar por pedidos nuevos a partir de la segunda carga en adelante;
      // en la primera carga real (dispositivo nunca antes usado) no hay que
      // hacer sonar nada.
      if (knownOrderIdsRef.current) {
        const fresh = mapped.filter((o) => !knownOrderIdsRef.current.has(o.id));
        if (fresh.length > 0) {
          // En navegadores móviles, reproducir sonido desde un temporizador
          // (sin gesto directo del usuario) puede ser bloqueado por la
          // política de autoplay y lanzar un error; sin este try/catch ese
          // error interrumpía todo lo que sigue e impedía marcar el pedido
          // como "ya visto" más abajo — la alerta volvía a sonar sin parar
          // cada 7s, solo en celular, hasta recargar la página.
          try {
            // Deduplicar por id al acumular: si por lo que sea el mismo pedido
            // se llegara a detectar como "nuevo" más de una vez, que nunca se
            // cuente dos veces en el banner.
            setNewOrderAlert((prev) => {
              const prevOrders = prev?.orders || [];
              const seenIds = new Set(prevOrders.map((o) => o.id));
              const newOnes = fresh.filter((o) => !seenIds.has(o.id));
              return { orders: [...newOnes, ...prevOrders] };
            });
            playPagerBeep();
            if (!alertIntervalRef.current) {
              alertIntervalRef.current = setInterval(playPagerBeep, 2000);
            }
            fresh.forEach(notifyNewOrder);
          } catch {
            // noop — ver comentario arriba.
          }
        }
        // Se AGREGA a los ids ya conocidos, nunca se reemplaza el set completo:
        // en conexiones inestables (móviles/tablets) una revisión puntual
        // podía llegar incompleta o fallar parcialmente, "olvidando"
        // momentáneamente un pedido ya visto — y al reaparecer en una
        // revisión siguiente, se volvía a tratar como nuevo sin parar.
        mapped.forEach((o) => knownOrderIdsRef.current.add(o.id));
        // Tope simple para que el set no crezca sin límite con los meses: si
        // ya pasó de 2000 ids, no hace falta conservar los muy viejos — nunca
        // van a volver a aparecer en /api/orders (que ya trae como mucho 500).
        if (knownOrderIdsRef.current.size > 2000) {
          knownOrderIdsRef.current = new Set(mapped.map((o) => o.id));
        }
      } else {
        knownOrderIdsRef.current = new Set(mapped.map((o) => o.id));
      }

      try {
        localStorage.setItem(KNOWN_ORDER_IDS_KEY, JSON.stringify([...knownOrderIdsRef.current]));
      } catch {
        // si el almacenamiento está lleno o no disponible, no es crítico
      }
    }).catch(() => {}).finally(() => {
      loadingOrdersRef.current = false;
    });
  }, [playPagerBeep, notifyNewOrder]);

  const loadMenu = useCallback(() => {
    api("/api/menu?all=1").then(setMenuData).catch(() => {});
  }, []);

  const loadLocations = useCallback(() => {
    api("/api/delivery-locations?all=1").then((d) => setLocations(d.locations || [])).catch(() => {});
  }, []);

  const loadCategories = useCallback(() => {
    api("/api/categories?all=1").then((d) => setCategories(d.categories || [])).catch(() => {});
  }, []);

  useEffect(() => {
    if (authState !== "unlocked") return;
    loadOrders();
    loadMenu();
    loadLocations();
    loadCategories();
    const interval = setInterval(loadOrders, 7000);
    return () => clearInterval(interval);
  }, [authState, loadOrders, loadMenu, loadLocations, loadCategories]);

  const handlePin = async (e) => {
    e.preventDefault();
    ensureAudioContext();
    try {
      await api("/api/admin/login", { method: "POST", body: JSON.stringify({ password: pinInput }) });
      setAuthState("unlocked");
    } catch {
      setPinError(true);
      setTimeout(() => setPinError(false), 1500);
      setPinInput("");
    }
  };

  const handleLogout = async () => {
    // Si había una alerta de pedido nuevo sonando, que no se quede pitando
    // detrás de la pantalla de PIN (el componente nunca se desmonta, solo
    // cambia de pantalla).
    stopAlertSound();
    setNewOrderAlert(null);
    await api("/api/admin/logout", { method: "POST" }).catch(() => {});
    setAuthState("locked");
  };

  // ── PIN SCREEN ──
  if (authState !== "unlocked") {
    return (
      <div className="adm-pin-screen" data-theme={theme}>
        <button
          className="adm-pin-theme-toggle"
          onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
          title={theme === "dark" ? "Cambiar a tema claro" : "Cambiar a tema oscuro"}
        >
          {theme === "dark" ? <IconSun /> : <IconMoon />}
        </button>
        <div className="adm-pin-card">
          <div className="adm-pin-logo">
            {!logoError ? (
              <img
                src={logoImg}
                alt="Cómo Sería"
                onError={() => setLogoError(true)}
                style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "50%" }}
              />
            ) : (
              <span>CS</span>
            )}
          </div>
          <h2 className="adm-pin-title">Panel de Administración</h2>
          <p className="adm-pin-sub">Cómo Sería — Acceso restringido</p>
          {authState === "checking" ? (
            <p className="adm-pin-sub">Verificando sesión...</p>
          ) : (
            <form onSubmit={handlePin} className="adm-pin-form">
              <div className="adm-password-wrap">
                <input
                  id="admin-pin"
                  className={`adm-pin-input ${pinError ? "error" : ""}`}
                  type={pinVisible ? "text" : "password"}
                  placeholder="Contraseña"
                  value={pinInput}
                  onChange={(e) => setPinInput(e.target.value)}
                  autoFocus
                />
                <button
                  type="button"
                  className="adm-password-toggle"
                  onClick={() => setPinVisible((v) => !v)}
                  tabIndex={-1}
                  aria-label={pinVisible ? "Ocultar contraseña" : "Mostrar contraseña"}
                >
                  {pinVisible ? <IconEyeOff /> : <IconEye />}
                </button>
              </div>
              {pinError && <p className="adm-pin-error">Contraseña incorrecta</p>}
              <button type="submit" className="adm-pin-btn">Ingresar →</button>
            </form>
          )}
          <a href="/" className="adm-back-link">← Volver al menú</a>
        </div>
      </div>
    );
  }

  // ── COMPUTE STATS (todas sobre filteredOrders, según el rango elegido) ──
  const rangeRevenue = filteredOrders.reduce((s, o) => s + o.total, 0);
  const rangeAvg = filteredOrders.length > 0 ? Math.round(rangeRevenue / filteredOrders.length) : 0;
  const productRanking = buildProductRanking(filteredOrders);
  const paymentBreakdown = buildPaymentBreakdown(filteredOrders);
  const deliveryBreakdown = buildDeliveryBreakdown(filteredOrders);
  const summaryReport = buildSummaryReport(filteredOrders, productRanking, paymentBreakdown, deliveryBreakdown);

  const handleExportSummaryPDF = async () => {
    setExportingSummaryPdf(true);
    try {
      await exportSummaryPDF(summaryReport, exportLabel);
    } catch {
      // si falla (ej. no se pudo cargar el logo), el usuario puede reintentar
    } finally {
      setExportingSummaryPdf(false);
    }
  };

  const rangeControls = (
    <div className="adm-range-controls">
      <span className="adm-toolbar-label">📅 Rango</span>
      {RANGE_PRESETS.map((p) => (
        <button
          key={p.key}
          className={`adm-range-btn ${rangePreset === p.key ? "active" : ""}`}
          onClick={() => setRangePreset(p.key)}
        >
          {p.label}
        </button>
      ))}
      <button
        className={`adm-range-btn ${rangePreset === "custom" ? "active" : ""}`}
        onClick={() => setRangePreset("custom")}
      >
        Personalizado
      </button>
      {rangePreset === "custom" && (
        <DateRangePicker
          from={customFrom}
          to={customTo}
          onChange={({ from, to }) => { setCustomFrom(from); setCustomTo(to); }}
        />
      )}
    </div>
  );

  // ── DASHBOARD ──
  return (
    <div className="adm-root" data-theme={theme}>
      {showScrollTop && (
        <button className="adm-scroll-top-btn" onClick={scrollToTop} title="Volver arriba">
          <IconArrowUp />
        </button>
      )}
      {toast && <div className="adm-toast">✓ {toast}</div>}
      {newOrderAlert && (
        <div className="adm-new-order-banner" onClick={dismissNewOrderAlert}>
          <span className="adm-new-order-icon">🔔</span>
          <span className="adm-new-order-text">
            {newOrderAlert.orders.length === 1
              ? `¡Nuevo pedido de ${newOrderAlert.orders[0].customerName}!`
              : `¡${newOrderAlert.orders.length} pedidos nuevos!`}
          </span>
          <button className="adm-new-order-dismiss">
            Ver pedido{newOrderAlert.orders.length > 1 ? "s" : ""}
          </button>
        </div>
      )}
      {/* Header */}
      <header className="adm-header">
        <div className="adm-header-inner">
          <div className="adm-header-brand">
            <div className="adm-header-logo">
              {!logoError ? (
                <img
                  src={logoImg}
                  alt="Cómo Sería"
                  onError={() => setLogoError(true)}
                  style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "50%" }}
                />
              ) : (
                <span>CS</span>
              )}
            </div>
            <div>
              <div className="adm-header-title">CÓMO SERÍA</div>
              <div className="adm-header-sub">Panel de Administración</div>
            </div>
          </div>
          <div className="adm-header-actions">
            <button
              className="adm-export-btn adm-theme-toggle"
              onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
              title={theme === "dark" ? "Cambiar a tema claro" : "Cambiar a tema oscuro"}
            >
              {theme === "dark" ? <IconSun /> : <IconMoon />}
            </button>
            {notifPermission === "default" && (
              <button className="adm-export-btn adm-notif-btn" onClick={requestNotificationPermission}>
                🔔 Activar notificaciones
              </button>
            )}
            <div className="adm-profile-menu-wrap">
              <button className="adm-export-btn" onClick={() => setShowProfileMenu((v) => !v)}>
                <IconUser /> Perfil ▾
              </button>
              {showProfileMenu && (
                <>
                  <div className="adm-dropdown-catcher" onClick={() => setShowProfileMenu(false)} />
                  <div className="adm-profile-dropdown">
                    <button onClick={() => { setShowChangePassword(true); setShowProfileMenu(false); }}>
                      🔑 Cambiar contraseña admin
                    </button>
                    <button onClick={() => { setShowChangeDeletePin(true); setShowProfileMenu(false); }}>
                      🗑️ Cambiar clave de eliminación
                    </button>
                    <button onClick={() => { setShowBluetoothPrinters(true); setShowProfileMenu(false); }}>
                      🖨️ Impresoras Bluetooth
                    </button>
                  </div>
                </>
              )}
            </div>
            <button className="adm-export-btn" onClick={handleLogout}>Cerrar sesión</button>
            <a href="/" className="adm-menu-link">Ver menú →</a>
          </div>
        </div>
      </header>

      {showChangePassword && <ChangePasswordModal onClose={() => setShowChangePassword(false)} />}
      {showChangeDeletePin && <ChangeDeletePinModal onClose={() => setShowChangeDeletePin(false)} />}
      {showBluetoothPrinters && <BluetoothPrintersModal onClose={() => setShowBluetoothPrinters(false)} />}
      {deletingOrder && (
        <DeleteConfirmModal
          title="Eliminar pedido"
          message={`¿Eliminar el pedido de ${deletingOrder.customerName} por ${fmt(deletingOrder.total)}? Esta acción no se puede deshacer.`}
          onClose={() => setDeletingOrder(null)}
          onConfirm={async (pin) => {
            await api(`/api/orders/${deletingOrder.id}`, { method: "DELETE", body: JSON.stringify({ pin }) });
            setDeletingOrder(null);
            loadOrders();
            showToast("Pedido eliminado");
          }}
        />
      )}

      <main className="adm-main">
        {/* Tabs */}
        <div className="adm-tabs">
          {["resumen", "pedidos", "menu", "categorias", "domicilios"].map((t) => (
            <button
              key={t}
              className={`adm-tab ${tab === t ? "active" : ""}`}
              onClick={() => setTab(t)}
            >
              {t === "resumen" ? "📊 Resumen" : t === "pedidos" ? "📋 Pedidos" : t === "menu" ? "🍔 Menú" : t === "categorias" ? "🗂️ Categorías" : "🛵 Domicilios"}
            </button>
          ))}
          <div className="adm-live-badge">
            <span className="adm-live-dot" />
            En vivo
          </div>
        </div>

        {tab === "resumen" && (
          <>
            <div className="adm-toolbar">
              {rangeControls}
              <div className="adm-export-row">
                <button className="adm-export-btn" onClick={() => exportSummaryCSV(summaryReport, exportLabel)} title="Exportar CSV">
                  ⬇ CSV
                </button>
                <button className="adm-export-btn" onClick={() => exportSummaryExcel(summaryReport, exportLabel)} title="Exportar Excel">
                  ⬇ Excel
                </button>
                <button className="adm-export-btn" onClick={handleExportSummaryPDF} disabled={exportingSummaryPdf} title="Exportar PDF">
                  {exportingSummaryPdf ? <><span className="adm-btn-spinner" /> Generando...</> : "⬇ PDF"}
                </button>
              </div>
            </div>

            {/* Stat Cards */}
            <div className="adm-stats-grid">
              <StatCard
                icon="📦"
                label="Pedidos"
                value={filteredOrders.length}
                sub={range.from ? "en el rango elegido" : "histórico completo"}
                accent="#1B8C37"
              />
              <StatCard
                icon="💵"
                label="Ventas totales"
                value={fmt(rangeRevenue)}
                sub={`${filteredOrders.length} pedidos`}
                accent="#2563EB"
              />
              <StatCard
                icon="🛵"
                label="Total domicilios"
                value={fmt(deliveryBreakdown.domicilioFeeTotal)}
                sub={`${deliveryBreakdown.domicilioCount} pedidos a domicilio`}
                accent="#D97706"
              />
              <StatCard
                icon="📊"
                label="Promedio por pedido"
                value={fmt(rangeAvg)}
                sub="por pedido"
                accent="#7C3AED"
              />
            </div>

            {/* Ventas y pedidos por día */}
            <div className="adm-section">
              <div className="adm-section-title">Ventas y pedidos — últimos 7 días</div>
              <div className="adm-chart-container">
                <TrendChart orders={orders} />
              </div>
            </div>

            {/* Top productos */}
            <div className="adm-section">
              <div className="adm-section-title">🏆 Top productos</div>
              {productRanking.length === 0 ? (
                <p className="adm-menu-empty">Sin ventas en este rango.</p>
              ) : (
                <div className="adm-ranking-list">
                  {productRanking.map((p, i) => (
                    <div key={p.name} className="adm-ranking-row">
                      <span className="adm-ranking-pos">{rankBadge(i)}</span>
                      <span className="adm-ranking-name">{p.name}</span>
                      <span className="adm-ranking-qty">{p.qty} und.</span>
                      <span className="adm-ranking-total">{fmt(p.total)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Métodos de pago */}
            <div className="adm-section">
              <div className="adm-section-title">💳 Métodos de pago</div>
              {paymentBreakdown.length === 0 ? (
                <p className="adm-menu-empty">Sin pedidos en este rango.</p>
              ) : (
                <div className="adm-day-table">
                  {paymentBreakdown.map((p, i) => (
                    <div key={p.method} className="adm-day-row">
                      <div className="adm-day-label">
                        <span className="adm-day-pos">#{i + 1}</span>
                        {PAYMENT_LABELS[p.method] || p.method}
                      </div>
                      <div className="adm-day-count">{p.count} {p.count === 1 ? "pedido" : "pedidos"}</div>
                      <div className="adm-day-total">{fmt(p.total)}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Domicilios */}
            <div className="adm-section">
              <div className="adm-section-title">🛵 Domicilios</div>
              <div className="adm-stats-grid">
                <StatCard icon="🏪" label="Para recoger" value={deliveryBreakdown.recogerCount} sub={fmt(deliveryBreakdown.recogerTotal)} accent="#1B8C37" />
                <StatCard icon="🛵" label="A domicilio" value={deliveryBreakdown.domicilioCount} sub={fmt(deliveryBreakdown.domicilioTotal)} accent="#2563EB" />
              </div>
              {deliveryBreakdown.zones.length > 0 && (
                <div className="adm-mt-12">
                  <div className="adm-menu-category-title">🏆 Top Zonas</div>
                  <div className="adm-ranking-list">
                    {deliveryBreakdown.zones.map((z, i) => (
                      <div key={z.name} className="adm-ranking-row">
                        <span className="adm-ranking-pos">{rankBadge(i)}</span>
                        <span className="adm-ranking-name">{z.name}</span>
                        <span className="adm-ranking-qty">{z.count} {z.count === 1 ? "pedido" : "pedidos"}</span>
                        <span className="adm-ranking-total">{fmt(z.deliveryTotal)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </>
        )}

        {tab === "pedidos" && (
          <>
            <div className="adm-toolbar">
              {rangeControls}
              <div className="adm-export-row">
                <button className="adm-export-btn" onClick={() => exportCSV(filteredOrders, exportLabel)} title="Exportar CSV">
                  ⬇ CSV
                </button>
                <button className="adm-export-btn" onClick={() => exportExcel(filteredOrders, exportLabel)} title="Exportar Excel">
                  ⬇ Excel
                </button>
                <button className="adm-export-btn" onClick={handleExportOrdersPDF} disabled={exportingOrdersPdf} title="Exportar PDF">
                  {exportingOrdersPdf ? <><span className="adm-btn-spinner" /> Generando...</> : "⬇ PDF"}
                </button>
              </div>
            </div>

            <div className="adm-section">
              <div className="adm-section-title">
                Pedidos {range.from ? "en el rango" : "recientes"}
                <span className="adm-count-badge">{filteredOrders.length} total</span>
              </div>
              <RecentOrders
                orders={filteredOrders}
                onPrint={handlePrintComanda}
                onDelete={setDeletingOrder}
                highlightOrderId={highlightOrderId}
              />
            </div>
          </>
        )}

        {tab === "menu" && <MenuManager menuData={menuData} categories={categories} reload={loadMenu} />}

        {tab === "categorias" && <CategoryManager categories={categories} reload={loadCategories} />}

        {tab === "domicilios" && <DeliveryManager locations={locations} reload={loadLocations} />}

        {/* Info notice */}
        <div className="adm-notice">
          <div className="adm-notice-icon">ℹ️</div>
          <div>
            <strong>Sobre estos datos:</strong> los pedidos y el menú se guardan en la base de datos del restaurante, visibles desde cualquier dispositivo con acceso a este panel.
          </div>
        </div>
      </main>
    </div>
  );
}
