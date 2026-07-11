import { useState, useEffect, useCallback, useRef } from "react";

const fmt = (n) => "$" + n.toLocaleString("es-CO");
const CATEGORY_LABELS = { hamburguesas: "Hamburguesas", tenders: "Chicken Tenders", combos: "Combos", adiciones: "Adiciones", bebidas: "Bebidas" };
const CATEGORIES = Object.keys(CATEGORY_LABELS);

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
const RANK_MEDALS = ["🥇", "🥈", "🥉"];
const rankBadge = (i) => RANK_MEDALS[i] || `#${i + 1}`;

const getTodayKey = () => new Date().toISOString().slice(0, 10);

const getLast7Days = () => {
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    days.push({
      key: d.toISOString().slice(0, 10),
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
    date: created.toISOString().slice(0, 10),
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
    parts.push(`Adiciones: ${item.adiciones.map((a) => a.name).join(", ")}`);
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
function smoothPath(points) {
  let d = `M${points[0].x},${points[0].y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] || points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] || p2;
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C${cp1x},${cp1y} ${cp2x},${cp2y} ${p2.x},${p2.y}`;
  }
  return d;
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
            <div className="adm-order-item-line">➕ {item.adiciones.map((a) => a.name).join(", ")}</div>
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

// ─── RECENT ORDERS ─────────────────────────────────────────────────────────
function RecentOrders({ orders }) {
  const [expandedId, setExpandedId] = useState(null);
  const recent = [...orders].reverse().slice(0, 15);
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
          <div key={o.id || i} className="adm-order-wrap">
            <div className="adm-order-row adm-order-row-clickable" onClick={() => setExpandedId(isOpen ? null : o.id)}>
              <div className="adm-order-left">
                <div className="adm-order-name">
                  <span className="adm-order-index">#{orders.length - i}</span>
                  {o.customerName}
                </div>
                <div className="adm-order-meta">
                  {o.date} · {o.time} · {o.itemsCount} {o.itemsCount === 1 ? "producto" : "productos"}
                </div>
              </div>
              <div className="adm-order-right">
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
function ProductForm({ initial, onSubmit, onCancel }) {
  const isEditing = !!initial?.id;
  const [category, setCategory] = useState(initial?.category || "hamburguesas");
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
        burgerImg: specialEdition ? burgerImg : null,
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
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
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
          Edición especial (destacada con foto, como "Cali Vibes")
        </label>
      </div>
      {specialEdition && (
        <div className="adm-form-field">
          Foto del producto
          <input type="file" accept="image/*" onChange={handleImageChange} />
          {imageBusy && <p className="adm-image-hint">Procesando imagen...</p>}
          {imageError && <p className="adm-form-error">{imageError}</p>}
          {burgerImg && (
            <div className="adm-image-preview-wrap">
              <img src={burgerImg} alt="Vista previa" className="adm-image-preview" />
              <button type="button" className="adm-btn-ghost adm-btn-sm" onClick={() => setBurgerImg(null)}>Quitar imagen</button>
            </div>
          )}
        </div>
      )}
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
function MenuManager({ menuData, reload }) {
  const [editingItem, setEditingItem] = useState(null);
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
          {CATEGORIES.map((cat) => (
            <div key={cat} className="adm-menu-category">
              <div className="adm-menu-category-title">{CATEGORY_LABELS[cat]}</div>
              {(menuData[cat] || []).length === 0 && (
                <p className="adm-menu-empty">Sin productos en esta categoría.</p>
              )}
              {(menuData[cat] || []).map((item) => (
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
                    <button className="adm-btn-ghost adm-btn-sm" onClick={() => setEditingItem({ ...item, category: cat })}>Editar</button>
                    <button className="adm-btn-ghost adm-btn-sm" disabled={busyId === item.id} onClick={() => toggleActive(item)}>
                      {item.isActive === false ? "Activar" : "Desactivar"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
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

// ─── ADMIN DASHBOARD ───────────────────────────────────────────────────────
export default function AdminDashboard() {
  const [authState, setAuthState] = useState("checking"); // checking | locked | unlocked
  const [pinInput, setPinInput] = useState("");
  const [pinError, setPinError] = useState(false);
  const [tab, setTab] = useState("resumen");
  const [orders, setOrders] = useState([]);
  const [menuData, setMenuData] = useState({});
  const [locations, setLocations] = useState([]);
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

  const loadOrders = useCallback(() => {
    api("/api/orders").then((d) => setOrders((d.orders || []).map(mapOrderRow))).catch(() => {});
  }, []);

  const loadMenu = useCallback(() => {
    api("/api/menu?all=1").then(setMenuData).catch(() => {});
  }, []);

  const loadLocations = useCallback(() => {
    api("/api/delivery-locations?all=1").then((d) => setLocations(d.locations || [])).catch(() => {});
  }, []);

  useEffect(() => {
    if (authState !== "unlocked") return;
    loadOrders();
    loadMenu();
    loadLocations();
    const interval = setInterval(loadOrders, 30000);
    return () => clearInterval(interval);
  }, [authState, loadOrders, loadMenu, loadLocations]);

  const handlePin = async (e) => {
    e.preventDefault();
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
    await api("/api/admin/logout", { method: "POST" }).catch(() => {});
    setAuthState("locked");
  };

  // ── PIN SCREEN ──
  if (authState !== "unlocked") {
    return (
      <div className="adm-pin-screen">
        <div className="adm-pin-card">
          <div className="adm-pin-logo">CS</div>
          <h2 className="adm-pin-title">Panel de Administración</h2>
          <p className="adm-pin-sub">Como Seria — Acceso restringido</p>
          {authState === "checking" ? (
            <p className="adm-pin-sub">Verificando sesión...</p>
          ) : (
            <form onSubmit={handlePin} className="adm-pin-form">
              <input
                id="admin-pin"
                className={`adm-pin-input ${pinError ? "error" : ""}`}
                type="password"
                placeholder="Contraseña"
                value={pinInput}
                onChange={(e) => setPinInput(e.target.value)}
                autoFocus
              />
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
    <div className="adm-root">
      {/* Header */}
      <header className="adm-header">
        <div className="adm-header-inner">
          <div className="adm-header-brand">
            <div className="adm-header-logo">CS</div>
            <div>
              <div className="adm-header-title">COMO SERIA</div>
              <div className="adm-header-sub">Panel de Administración</div>
            </div>
          </div>
          <div className="adm-header-actions">
            <button className="adm-export-btn" onClick={handleLogout}>Cerrar sesión</button>
            <a href="/" className="adm-menu-link">Ver menú →</a>
          </div>
        </div>
      </header>

      <main className="adm-main">
        {/* Tabs */}
        <div className="adm-tabs">
          {["resumen", "pedidos", "menu", "domicilios"].map((t) => (
            <button
              key={t}
              className={`adm-tab ${tab === t ? "active" : ""}`}
              onClick={() => setTab(t)}
            >
              {t === "resumen" ? "📊 Resumen" : t === "pedidos" ? "📋 Pedidos" : t === "menu" ? "🍔 Menú" : "🛵 Domicilios"}
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
              <RecentOrders orders={filteredOrders} />
            </div>
          </>
        )}

        {tab === "menu" && <MenuManager menuData={menuData} reload={loadMenu} />}

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
