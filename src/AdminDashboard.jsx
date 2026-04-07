import { useState, useEffect } from "react";

const ORDER_KEY = "como_seria_orders";
const ADMIN_PIN = "CS2025"; // cambiar si se desea

// ─── HELPERS ──────────────────────────────────────────────────────────────────
const getOrders = () => {
  try {
    return JSON.parse(localStorage.getItem(ORDER_KEY) || "[]");
  } catch {
    return [];
  }
};

const fmt = (n) => "$" + n.toLocaleString("es-CO");

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

function exportCSV(orders) {
  const rows = [
    ["Fecha", "Hora", "Cliente", "Productos", "Total"].join(","),
    ...orders.map((o) =>
      [o.date, o.time, `"${o.customerName}"`, o.items, o.total].join(",")
    ),
  ];
  const blob = new Blob([rows.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `como-seria-pedidos-${getTodayKey()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
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

// ─── BAR CHART ─────────────────────────────────────────────────────────────
function BarChart({ orders }) {
  const days = getLast7Days();
  const countByDay = {};
  orders.forEach((o) => {
    countByDay[o.date] = (countByDay[o.date] || 0) + 1;
  });
  const maxCount = Math.max(...days.map((d) => countByDay[d.key] || 0), 1);

  return (
    <div className="adm-chart-wrap">
      {days.map((d) => {
        const count = countByDay[d.key] || 0;
        const heightPct = Math.max((count / maxCount) * 100, 4);
        const isToday = d.key === getTodayKey();
        return (
          <div key={d.key} className="adm-bar-col">
            <div className="adm-bar-count">{count > 0 ? count : ""}</div>
            <div className="adm-bar-track">
              <div
                className={`adm-bar-fill ${isToday ? "today" : ""}`}
                style={{ height: `${heightPct}%` }}
              />
            </div>
            <div className={`adm-bar-label ${isToday ? "today" : ""}`}>
              {d.short}
              {isToday && <span className="adm-today-dot" />}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── RECENT ORDERS ─────────────────────────────────────────────────────────
function RecentOrders({ orders }) {
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
      {recent.map((o, i) => (
        <div key={o.id || i} className="adm-order-row">
          <div className="adm-order-left">
            <div className="adm-order-name">
              <span className="adm-order-index">#{orders.length - i}</span>
              {o.customerName}
            </div>
            <div className="adm-order-meta">
              {o.date} · {o.time} · {o.items} {o.items === 1 ? "producto" : "productos"}
            </div>
          </div>
          <div className="adm-order-total">{fmt(o.total)}</div>
        </div>
      ))}
    </div>
  );
}

// ─── ADMIN DASHBOARD ───────────────────────────────────────────────────────
export default function AdminDashboard() {
  const [pinInput, setPinInput] = useState("");
  const [unlocked, setUnlocked] = useState(() => sessionStorage.getItem("adm_ok") === "1");
  const [pinError, setPinError] = useState(false);
  const [orders, setOrders] = useState(getOrders);
  const [tab, setTab] = useState("resumen");

  useEffect(() => {
    // Refresh orders every 30 seconds
    const interval = setInterval(() => setOrders(getOrders()), 30000);
    return () => clearInterval(interval);
  }, []);

  const handlePin = (e) => {
    e.preventDefault();
    if (pinInput.toUpperCase() === ADMIN_PIN) {
      sessionStorage.setItem("adm_ok", "1");
      setUnlocked(true);
    } else {
      setPinError(true);
      setTimeout(() => setPinError(false), 1500);
      setPinInput("");
    }
  };

  // ── PIN SCREEN ──
  if (!unlocked) {
    return (
      <div className="adm-pin-screen">
        <div className="adm-pin-card">
          <div className="adm-pin-logo">CS</div>
          <h2 className="adm-pin-title">Panel de Métricas</h2>
          <p className="adm-pin-sub">Como Seria — Acceso restringido</p>
          <form onSubmit={handlePin} className="adm-pin-form">
            <input
              id="admin-pin"
              className={`adm-pin-input ${pinError ? "error" : ""}`}
              type="password"
              placeholder="Código de acceso"
              value={pinInput}
              onChange={(e) => setPinInput(e.target.value)}
              autoFocus
              maxLength={10}
            />
            {pinError && <p className="adm-pin-error">Código incorrecto</p>}
            <button type="submit" className="adm-pin-btn">Ingresar →</button>
          </form>
          <a href="/" className="adm-back-link">← Volver al menú</a>
        </div>
      </div>
    );
  }

  // ── COMPUTE STATS ──
  const today = getTodayKey();
  const todayOrders = orders.filter((o) => o.date === today);
  const weekOrders = orders.filter((o) => {
    const d = new Date(o.date);
    const now = new Date();
    const diff = (now - d) / (1000 * 60 * 60 * 24);
    return diff < 7;
  });
  const totalRevenue = orders.reduce((s, o) => s + o.total, 0);
  const avgOrder = orders.length > 0 ? Math.round(totalRevenue / orders.length) : 0;

  const last7Days = getLast7Days();
  const todayRevenue = todayOrders.reduce((s, o) => s + o.total, 0);

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
              <div className="adm-header-sub">Panel de Métricas</div>
            </div>
          </div>
          <div className="adm-header-actions">
            <button
              className="adm-export-btn"
              onClick={() => exportCSV(orders)}
              title="Exportar CSV"
            >
              ⬇ Exportar CSV
            </button>
            <a href="/" className="adm-menu-link">Ver menú →</a>
          </div>
        </div>
      </header>

      <main className="adm-main">
        {/* Tabs */}
        <div className="adm-tabs">
          {["resumen", "pedidos"].map((t) => (
            <button
              key={t}
              className={`adm-tab ${tab === t ? "active" : ""}`}
              onClick={() => setTab(t)}
            >
              {t === "resumen" ? "📊 Resumen" : "📋 Pedidos"}
            </button>
          ))}
          <div className="adm-live-badge">
            <span className="adm-live-dot" />
            En vivo
          </div>
        </div>

        {tab === "resumen" && (
          <>
            {/* Stat Cards */}
            <div className="adm-stats-grid">
              <StatCard
                icon="📅"
                label="Pedidos hoy"
                value={todayOrders.length}
                sub={todayRevenue > 0 ? fmt(todayRevenue) : "Sin pedidos aún"}
                accent="#1B8C37"
              />
              <StatCard
                icon="📆"
                label="Últimos 7 días"
                value={weekOrders.length}
                sub={`${fmt(weekOrders.reduce((s, o) => s + o.total, 0))}`}
                accent="#2563EB"
              />
              <StatCard
                icon="🏆"
                label="Total acumulado"
                value={orders.length}
                sub={fmt(totalRevenue)}
                accent="#7C3AED"
              />
              <StatCard
                icon="💰"
                label="Promedio por pedido"
                value={fmt(avgOrder)}
                sub={`${orders.length} pedidos total`}
                accent="#D97706"
              />
            </div>

            {/* Bar Chart */}
            <div className="adm-section">
              <div className="adm-section-title">Pedidos — últimos 7 días</div>
              <div className="adm-chart-container">
                <BarChart orders={orders} />
              </div>
            </div>

            {/* Day breakdown */}
            <div className="adm-section">
              <div className="adm-section-title">Detalle por día</div>
              <div className="adm-day-table">
                {last7Days.reverse().map((d) => {
                  const dayOrders = orders.filter((o) => o.date === d.key);
                  const dayTotal = dayOrders.reduce((s, o) => s + o.total, 0);
                  const isToday = d.key === today;
                  return (
                    <div key={d.key} className={`adm-day-row ${isToday ? "today" : ""}`}>
                      <div className="adm-day-label">
                        {d.label}
                        {isToday && <span className="adm-today-chip">Hoy</span>}
                      </div>
                      <div className="adm-day-count">
                        {dayOrders.length} {dayOrders.length === 1 ? "pedido" : "pedidos"}
                      </div>
                      <div className="adm-day-total">{dayTotal > 0 ? fmt(dayTotal) : "—"}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}

        {tab === "pedidos" && (
          <div className="adm-section">
            <div className="adm-section-title">
              Pedidos recientes
              <span className="adm-count-badge">{orders.length} total</span>
            </div>
            <RecentOrders orders={orders} />
          </div>
        )}

        {/* Info notice */}
        <div className="adm-notice">
          <div className="adm-notice-icon">ℹ️</div>
          <div>
            <strong>Sobre estos datos:</strong> Los pedidos se registran automáticamente cuando un cliente presiona "Enviar por WhatsApp". Los datos se almacenan en este navegador. Para métricas entre múltiples dispositivos, configura Google Analytics o el webhook a Google Sheets.
          </div>
        </div>
      </main>
    </div>
  );
}
