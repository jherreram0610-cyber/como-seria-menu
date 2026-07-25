import { useState, useRef, useCallback, useEffect } from "react";
import logoImg from "/logo.svg";
import AdminDashboard from "./AdminDashboard";
import { parseFramePosition } from "./framePosition.js";
import { PositionedImage } from "./imagePosition.jsx";

// ─── ROUTING ─────────────────────────────────────────────────────────────────
if (window.location.pathname === "/admin") {
  // Render admin dashboard instead of menu
}

// ─── ORDER TRACKING ──────────────────────────────────────────────────────────
function saveOrder(order) {
  fetch("/api/orders", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(order),
  }).catch((e) => console.warn("No se pudo guardar el pedido:", e));
}

// ─── DATA ────────────────────────────────────────────────────────────────────
const WHATSAPP_NUMBER = "573026233522";

// El menú real se carga desde /api/menu (base de datos). El contenido inicial
// para poblar esa base de datos vive en scripts/seed-menu.mjs.
const EMPTY_MENU = { hamburguesas: [], tenders: [], combos: [], adiciones: [], bebidas: [] };

const SIDES = [
  { id: "s1", name: "Papas", price: 0 },
  { id: "s2", name: "Papas Lemon Pepper", price: 0 },
  { id: "s3", name: "Aros de Cebolla", price: 1000 },
];

const fmt = (n) => "$" + n.toLocaleString("es-CO");
const formatAdicion = (a, itemQty = 1) => {
  const total = a.qty * itemQty;
  return total > 1 ? `${a.name} x${total}` : a.name;
};

// ─── ICONS ────────────────────────────────────────────────────────────────────
const IconCart = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>
);
const IconWhatsapp = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
);
const IconMinus = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="5" y1="12" x2="19" y2="12"/></svg>;
const IconPlus = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>;
const IconX = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>;
const IconCheck = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>;
const IconTrash = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>;
const IconMapPin = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>;
const IconClock = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>;
const IconStar = () => <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" stroke="none"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>;
const IconUser = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>;
const IconEdit = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>;

// ─── MAIN APP ────────────────────────────────────────────────────────────────
export default function ComoSeriaMenu() {
  const [activeCategory, setActiveCategory] = useState("hamburguesas");
  const [cart, setCart] = useState([]);
  const [modalItem, setModalItem] = useState(null);
  const [zoomedImage, setZoomedImage] = useState(null);
  const [showCart, setShowCart] = useState(false);
  const [toast, setToast] = useState(null);
  const [customerName, setCustomerName] = useState("");
  const [nameError, setNameError] = useState(false);
  const [logoError, setLogoError] = useState(false);
  const [showLeftArrow, setShowLeftArrow] = useState(false);
  const [showRightArrow, setShowRightArrow] = useState(true);
  const sectionRefs = useRef({});
  const navRef = useRef(null);
  const nameInputRef = useRef(null);

  const [MENU, setMENU] = useState(EMPTY_MENU);
  // groupByCategory (backend) solo incluye categorías con al menos un producto
  // activo, así que "bebidas"/"adiciones" pueden faltar por completo si esa
  // categoría se queda vacía o se desactiva — nunca asumir que existen.
  const menuBebidas = MENU.bebidas || [];
  const menuAdiciones = MENU.adiciones || [];
  const [menuLoading, setMenuLoading] = useState(true);
  const [menuError, setMenuError] = useState(false);
  const [DELIVERY_LOCATIONS, setDeliveryLocations] = useState([]);
  const [topProducts, setTopProducts] = useState({});
  const [categories, setCategories] = useState([]);
  const [paymentMethods, setPaymentMethods] = useState([]);

  // Carga el menú, las zonas de domicilio, las categorías y el ranking semanal
  // de más pedidos. En la carga inicial muestra el spinner/error de pantalla
  // completa; en las actualizaciones de fondo (poll) solo refresca los datos
  // en silencio, sin interrumpir al cliente.
  const loadMenuData = useCallback((isInitial) => {
    return Promise.all([
      fetch("/api/menu").then((r) => {
        if (!r.ok) throw new Error("No se pudo cargar el menú");
        return r.json();
      }),
      fetch("/api/delivery-locations").then((r) => {
        if (!r.ok) throw new Error("No se pudo cargar las zonas de domicilio");
        return r.json();
      }),
      fetch("/api/categories").then((r) => {
        if (!r.ok) throw new Error("No se pudo cargar las categorías");
        return r.json();
      }),
      fetch("/api/top-products").then((r) => (r.ok ? r.json() : { top: [] })).catch(() => ({ top: [] })),
      fetch("/api/payment-methods").then((r) => (r.ok ? r.json() : { paymentMethods: [] })).catch(() => ({ paymentMethods: [] })),
    ])
      .then(([menuData, deliveryData, categoryData, topData, paymentData]) => {
        setMENU(menuData);
        setDeliveryLocations(deliveryData.locations || []);
        setCategories(categoryData.categories || []);
        setTopProducts(Object.fromEntries((topData.top || []).map((t) => [t.id, t.rank])));
        setPaymentMethods(paymentData.paymentMethods || []);
        if (isInitial) setMenuLoading(false);
      })
      .catch(() => {
        if (isInitial) {
          setMenuError(true);
          setMenuLoading(false);
        }
        // si falla una actualización de fondo, simplemente se reintenta en el próximo ciclo
      });
  }, []);

  useEffect(() => {
    loadMenuData(true);
    const interval = setInterval(() => loadMenuData(false), 60000);
    return () => clearInterval(interval);
  }, [loadMenuData]);

  // Evaluar qué flechas mostrar según la posición del scroll
  const checkScrollArrows = useCallback(() => {
    const nav = navRef.current;
    if (!nav) return;
    setShowLeftArrow(nav.scrollLeft > 20);
    setShowRightArrow(nav.scrollWidth - nav.clientWidth - nav.scrollLeft > 20);
  }, []);

  useEffect(() => {
    const nav = navRef.current;
    if (!nav) return;

    checkScrollArrows();
    window.addEventListener("resize", checkScrollArrows);
    nav.addEventListener("scroll", checkScrollArrows, { passive: true });

    return () => {
      window.removeEventListener("resize", checkScrollArrows);
      nav.removeEventListener("scroll", checkScrollArrows);
    };
  }, [checkScrollArrows, menuLoading]);

  // Drag-to-scroll con mouse en desktop
  useEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    let isDown = false;
    let startX = 0;
    let scrollLeft = 0;
    const onMouseDown = (e) => {
      isDown = true;
      nav.classList.add("dragging");
      startX = e.pageX - nav.offsetLeft;
      scrollLeft = nav.scrollLeft;
    };
    const onMouseLeave = () => { isDown = false; nav.classList.remove("dragging"); };
    const onMouseUp   = () => { isDown = false; nav.classList.remove("dragging"); };
    const onMouseMove = (e) => {
      if (!isDown) return;
      e.preventDefault();
      const x = e.pageX - nav.offsetLeft;
      nav.scrollLeft = scrollLeft - (x - startX) * 1.2;
    };
    nav.addEventListener("mousedown",  onMouseDown);
    nav.addEventListener("mouseleave", onMouseLeave);
    nav.addEventListener("mouseup",    onMouseUp);
    nav.addEventListener("mousemove",  onMouseMove);
    return () => {
      nav.removeEventListener("mousedown",  onMouseDown);
      nav.removeEventListener("mouseleave", onMouseLeave);
      nav.removeEventListener("mouseup",    onMouseUp);
      nav.removeEventListener("mousemove",  onMouseMove);
    };
  }, [menuLoading]);

  // Modal state
  const [modalQty, setModalQty] = useState(1);
  const [removedIngredients, setRemovedIngredients] = useState([]);
  const [selectedAdiciones, setSelectedAdiciones] = useState([]);
  const [selectedBebida, setSelectedBebida] = useState(null);
  const [selectedSide, setSelectedSide] = useState(null);
  const [comment, setComment] = useState("");
  const [agrandarPapas, setAgrandarPapas] = useState(false);
  const [editingCartId, setEditingCartId] = useState(null);
  const [paymentMethod, setPaymentMethod] = useState(null);
  const selectedPaymentAccounts = paymentMethods.find((m) => m.id === paymentMethod)?.accounts || [];
  const [deliveryType, setDeliveryType] = useState("recoger"); // "recoger" o "domicilio"
  const [deliveryLocation, setDeliveryLocation] = useState(null); // selección de ubicación
  const [deliveryAddress, setDeliveryAddress] = useState(""); // dirección

  const showToast = useCallback((msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2200);
  }, []);

  const copyToClipboard = useCallback(async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      showToast("Copiado ✓");
    } catch {
      showToast("No se pudo copiar");
    }
  }, [showToast]);

  const cartCount = cart.reduce((sum, i) => sum + i.qty, 0);
  const cartTotal = cart.reduce((sum, i) => sum + i.totalPrice * i.qty, 0);

  const openModal = (item, category) => {
    setEditingCartId(null);
    setModalItem({ ...item, category });
    setModalQty(1);
    setRemovedIngredients([]);
    setSelectedAdiciones([]);
    setSelectedBebida(category === "combos" ? menuBebidas[0] : null);
    setSelectedSide(category === "combos" ? SIDES.find(s => s.id === "s1") : null);
    setComment("");
    setAgrandarPapas(false);
  };

  const openModalForEdit = (cartItem) => {
    const baseItem = MENU[cartItem.category]?.find((i) => i.id === cartItem.id) || cartItem;
    setEditingCartId(cartItem.cartId);
    setModalItem({ ...baseItem, category: cartItem.category });
    setModalQty(cartItem.qty);
    setRemovedIngredients(cartItem.removedIngredients || []);
    setSelectedAdiciones(cartItem.adiciones || []);
    setSelectedBebida(cartItem.bebida || (cartItem.category === "combos" ? menuBebidas[0] : null));
    setSelectedSide(cartItem.side || (cartItem.category === "combos" ? SIDES.find(s => s.id === "s1") : null));
    setComment(cartItem.comment || "");
    setAgrandarPapas(cartItem.agrandarPapas || false);
    setShowCart(false);
  };

  const closeModal = () => {
    setModalItem(null);
    setEditingCartId(null);
    setSelectedSide(null);
  };

  const toggleIngredient = (ing) => {
    setRemovedIngredients((prev) =>
      prev.includes(ing) ? prev.filter((i) => i !== ing) : [...prev, ing]
    );
  };

  const adjustAdicion = (ad, delta) => {
    setSelectedAdiciones((prev) => {
      const existing = prev.find((a) => a.id === ad.id);
      if (!existing) return delta > 0 ? [...prev, { ...ad, qty: 1 }] : prev;
      const qty = existing.qty + delta;
      if (qty <= 0) return prev.filter((a) => a.id !== ad.id);
      return prev.map((a) => (a.id === ad.id ? { ...a, qty } : a));
    });
  };

  const addToCart = () => {
    if (!modalItem || editingCartId) return;
    const adicionesTotal = selectedAdiciones.reduce((s, a) => s + a.price * a.qty, 0);
    const upsize = agrandarPapas ? 2000 : 0;
    const sidePrice = selectedSide?.price || 0;
    const bebidaExtra = modalItem.category === "combos" ? (selectedBebida?.comboExtra || 0) : 0;
    const unitPrice = modalItem.price + adicionesTotal + upsize + sidePrice + bebidaExtra;
    const cartItem = {
      cartId: Date.now() + Math.random(),
      id: modalItem.id,
      name: modalItem.name,
      basePrice: modalItem.price,
      bebida: selectedBebida,
      side: selectedSide,
      adiciones: [...selectedAdiciones],
      removedIngredients: [...removedIngredients],
      comment,
      agrandarPapas,
      qty: modalQty,
      totalPrice: unitPrice,
      category: modalItem.category,
    };
    setCart((prev) => [...prev, cartItem]);
    showToast(`${modalItem.name} agregado ✓`);
    closeModal();
  };

  const saveCartChanges = () => {
    if (!modalItem || !editingCartId) return;
    const adicionesTotal = selectedAdiciones.reduce((s, a) => s + a.price * a.qty, 0);
    const upsize = agrandarPapas ? 2000 : 0;
    const sidePrice = selectedSide?.price || 0;
    const bebidaExtra = modalItem.category === "combos" ? (selectedBebida?.comboExtra || 0) : 0;
    const unitPrice = modalItem.price + adicionesTotal + upsize + sidePrice + bebidaExtra;
    setCart((prev) => prev.map((item) => {
      if (item.cartId !== editingCartId) return item;
      return {
        ...item,
        id: modalItem.id,
        name: modalItem.name,
        basePrice: modalItem.price,
        bebida: selectedBebida,
        side: selectedSide,
        adiciones: [...selectedAdiciones],
        removedIngredients: [...removedIngredients],
        comment,
        agrandarPapas,
        qty: modalQty,
        totalPrice: unitPrice,
        category: modalItem.category,
      };
    }));
    showToast(`${modalItem.name} actualizado ✓`);
    closeModal();
  };

  const quickAdd = (item, category) => {
    if (category === "adiciones" || category === "bebidas") {
      const existing = cart.find((c) => c.id === item.id);
      if (existing) {
        setCart((prev) => prev.map((c) => c.cartId === existing.cartId ? { ...c, qty: c.qty + 1 } : c));
      } else {
        setCart((prev) => [...prev, {
          cartId: Date.now() + Math.random(), id: item.id, name: item.name,
          basePrice: item.price, adiciones: [], removedIngredients: [],
          comment: "", qty: 1, totalPrice: item.price, category,
        }]);
      }
      showToast(`${item.name} agregado ✓`);
    } else {
      openModal(item, category);
    }
  };

  const updateCartQty = (cartId, delta) => {
    setCart((prev) => prev.map((c) => {
      if (c.cartId !== cartId) return c;
      const newQty = c.qty + delta;
      return newQty <= 0 ? null : { ...c, qty: newQty };
    }).filter(Boolean));
  };

  const removeFromCart = (cartId) => {
    setCart((prev) => prev.filter((c) => c.cartId !== cartId));
  };

  const buildWhatsAppMessage = () => {
    let msg = "🍔 *Pedido - Como Seria*\n";
    msg += "━━━━━━━━━━━━━━━\n\n";
    msg += `👤 *Cliente: ${customerName.trim()}*\n\n`;
    cart.forEach((item, i) => {
      msg += `*${i + 1}. ${item.name}* x${item.qty}\n`;
      if (item.removedIngredients.length > 0) {
        msg += `   ❌ Sin: ${item.removedIngredients.join(", ")}\n`;
      }
      if (item.bebida) {
        msg += `   🥤 Bebida: ${item.bebida.name}${item.category === "combos" && item.bebida.comboExtra ? ` (+${fmt(item.bebida.comboExtra)})` : ''}\n`;
      }
      if (item.side) {
        msg += `   🍟 ${item.side.name}${item.side.price > 0 ? ` (+$${fmt(item.side.price)})` : ''}\n`;
      }
      if (item.adiciones.length > 0) {
        msg += `   ➕ Con: ${item.adiciones.map((a) => formatAdicion(a, item.qty)).join(", ")}\n`;
      }
      if (item.agrandarPapas) {
        msg += `   🍟 Papas Grandes (+$2.000)\n`;
      }
      if (item.comment) {
        msg += `   💬 ${item.comment}\n`;
      }
      msg += `   💲 ${fmt(item.totalPrice * item.qty)}\n\n`;
    });
    msg += "━━━━━━━━━━━━━━━\n";
    const deliveryFee = deliveryLocation?.price || 0;
    const totalWithDelivery = cartTotal + deliveryFee;
    if (deliveryType === "domicilio" && deliveryFee > 0) {
      msg += `*Subtotal: ${fmt(cartTotal)}*\n`;
      msg += `🛵 Domicilio: ${fmt(deliveryFee)}\n`;
      msg += `*TOTAL: ${fmt(totalWithDelivery)}*\n\n`;
    } else {
      msg += `*TOTAL: ${fmt(totalWithDelivery)}*\n\n`;
    }
    if (paymentMethod) {
      const selectedMethod = paymentMethods.find((m) => m.id === paymentMethod);
      msg += `💳 Método de pago: ${selectedMethod?.label || paymentMethod}\n`;
      const accounts = selectedMethod?.accounts || [];
      accounts.forEach((acc) => {
        msg += accounts.length > 1 ? `   ${acc.label}: ${acc.value}\n` : `   ${acc.value}\n`;
      });
      msg += "\n";
    }
    if (deliveryType === "recoger") {
      msg += "📍 Tipo: Para Recoger en Country Mall, Jamundí\n";
      msg += "⏰ Confirmar tiempo estimado por favor";
    } else {
      msg += `📍 Tipo: Domicilio\n`;
      msg += `📮 Ubicación: ${deliveryLocation?.name}\n`;
      msg += `💰 Costo envío: ${fmt(deliveryLocation?.price)}\n`;
      msg += `🏠 Dirección: ${deliveryAddress}\n`;
      msg += "⏰ Confirmar tiempo estimado de entrega";
    }

    return encodeURIComponent(msg);
  };

  const sendToWhatsApp = () => {
    if (cart.length === 0) return;
    if (!customerName.trim()) {
      setNameError(true);
      nameInputRef.current?.focus();
      nameInputRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    if (deliveryType === "domicilio" && (!deliveryLocation || !deliveryAddress.trim())) {
      return;
    }
    if (!paymentMethod) {
      return;
    }
    // Guardar el pedido en el backend para las métricas del panel de admin
    const deliveryFee = deliveryType === "domicilio" ? (deliveryLocation?.price || 0) : 0;
    saveOrder({
      customerName: customerName.trim(),
      items: cart,
      subtotal: cartTotal,
      deliveryFee,
      total: cartTotal + deliveryFee,
      deliveryType,
      deliveryLocation: deliveryLocation?.name || null,
      deliveryAddress: deliveryType === "domicilio" ? deliveryAddress.trim() : null,
      paymentMethod,
    });
    const msg = buildWhatsAppMessage();
    window.open(`https://wa.me/${WHATSAPP_NUMBER}?text=${msg}`, "_blank");
  };

  const scrollToSection = (catKey) => {
    setActiveCategory(catKey);
    const el = sectionRefs.current[catKey];
    if (el) {
      const offset = 130;
      const y = el.getBoundingClientRect().top + window.scrollY - offset;
      window.scrollTo({ top: y, behavior: "smooth" });
    }
  };

  const getItemQtyInCart = (itemId) => {
    return cart.filter((c) => c.id === itemId).reduce((s, c) => s + c.qty, 0);
  };

  // ─── RENDER ────────────────────────────────────────────────────────────────
  // Route to admin dashboard
  if (window.location.pathname === "/admin") {
    return <AdminDashboard />;
  }

  if (menuLoading) {
    return (
      <div className="menu-loading">
        <div className="menu-loading-spinner" />
        <p>Cargando menú...</p>
      </div>
    );
  }

  if (menuError) {
    return (
      <div className="menu-loading">
        <p>No se pudo cargar el menú. Intenta recargar la página.</p>
      </div>
    );
  }

  return (
    <>
      <div className="app">
        {/* HEADER */}
        <header className="header">
          <div className="header-top">
            <div className="brand">
              <div className="brand-logo">
                {!logoError ? (
                  <img
                    src={logoImg}
                    alt="Como Seria Logo"
                    onError={() => setLogoError(true)}
                    style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "50%" }}
                  />
                ) : (
                  <span>CS</span>
                )}
              </div>
              <div className="brand-text">
                <h1>Cómo Sería</h1>
                <p>Menú Digital · Pedidos para recoger y domicilios en Ciudad Country, 5 Soles, El Castillo y Pangola</p>
              </div>
            </div>
            <button className="cart-btn" id="btn-open-cart" onClick={() => setShowCart(true)}>
              <IconCart />
              {cartCount > 0 && <span className="cart-badge">{cartCount}</span>}
            </button>
          </div>
          <div className="header-info">
            <div className="header-info-item">
              <IconMapPin /> Country Mall, Jamundí
            </div>
            <div className="header-info-item">
              <IconClock /> Horario: mar-jue 5:30pm - 9:30pm | vie-dom y festivos 5:30pm - 10:00pm
            </div>
          </div>
        </header>

        {/* CATEGORY NAV */}
        <div className="cat-nav-wrap">
          <nav className="cat-nav" ref={navRef}>
            {categories
              .filter((cat) => (MENU[cat.id]?.length || 0) > 0)
              .map((cat) => (
                <button
                  key={cat.id}
                  id={`cat-${cat.id}`}
                  className={`cat-pill ${activeCategory === cat.id ? "active" : ""}`}
                  onClick={() => scrollToSection(cat.id)}
                >
                  <span className="cat-emoji">{cat.icon}</span> {cat.label}
                </button>
              ))}
          </nav>
          {/* Flecha izquierda */}
          {showLeftArrow && (
            <button
              className="scroll-hint scroll-hint-left"
              aria-label="Anterior categoría"
              onClick={() => {
                const nav = navRef.current;
                if (nav) nav.scrollBy({ left: -200, behavior: "smooth" });
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6"/>
              </svg>
            </button>
          )}
          {/* Flecha derecha */}
          {showRightArrow && (
            <button
              className="scroll-hint scroll-hint-right"
              aria-label="Ver más categorías"
              onClick={() => {
                const nav = navRef.current;
                if (nav) nav.scrollBy({ left: 200, behavior: "smooth" });
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9 18 15 12 9 6"/>
              </svg>
            </button>
          )}
        </div>

        {/* CUSTOMER NAME FIELD */}
        <div className="customer-banner">
          <div className="customer-inner">
            <div className="customer-icon">
              <IconUser />
            </div>
            <div className="customer-field-wrap">
              <label className="customer-label" htmlFor="customer-name">
                ¿Cómo te llamas?
              </label>
              <input
                id="customer-name"
                ref={nameInputRef}
                className={`customer-input ${nameError ? "error" : ""} ${customerName.trim() ? "filled" : ""}`}
                type="text"
                placeholder="Tu nombre para el pedido..."
                value={customerName}
                maxLength={40}
                onChange={(e) => {
                  setCustomerName(e.target.value);
                  if (e.target.value.trim()) setNameError(false);
                }}
              />
              {nameError && (
                <span className="customer-error">Ingresa tu nombre antes de enviar el pedido</span>
              )}
            </div>
            {customerName.trim() && (
              <div className="customer-ok">
                <IconCheck />
              </div>
            )}
          </div>
        </div>

        {/* SECTIONS */}
        {Object.entries(MENU).map(([catKey, items]) => {
          const catMeta = categories.find((c) => c.id === catKey);
          if (!catMeta) return null;
          return (
          <section
            key={catKey}
            className="section"
            ref={(el) => (sectionRefs.current[catKey] = el)}
          >
            <h2 className="section-title">
              {catMeta.icon} {catMeta.label}
              <span className="sec-line" />
            </h2>

            {items.map((item, idx) => {
              const inCartQty = getItemQtyInCart(item.id);
              const isSimple = catKey === "adiciones" || catKey === "bebidas";
              const isSpecial = item.special;
              return (
                <div
                  key={item.id}
                  id={`product-${item.id}`}
                  className={`product-card ${inCartQty > 0 ? "in-cart" : ""} ${isSpecial ? "bm-card" : ""}`}
                  style={{ animationDelay: `${idx * 0.05}s` }}
                  onClick={() => !isSimple && openModal(item, catKey)}
                >
                  {isSpecial && (
                    <div className="bm-header">
                      {item.isBurgerMaster && (
                        <img src="/bm2026.png" alt="Burger Master 2026" className="bm-logo" />
                      )}
                      <span className="bm-badge">🎉 EDICIÓN ESPECIAL</span>
                    </div>
                  )}
                  {item.burgerImg && (
                    <PositionedImage
                      src={item.burgerImg}
                      alt={item.name}
                      className="bm-burger-img-wrap"
                      {...parseFramePosition(item.burgerImgPosition)}
                    />
                  )}
                  <div className="product-top">
                    <div className="product-info">
                      <div className="product-name">
                        {item.name}
                        {topProducts[item.id] && (
                          <span className="top-tag">🏆 Top {topProducts[item.id]} de la semana</span>
                        )}
                        {item.popular && (
                          <span className="popular-tag"><IconStar /> Popular</span>
                        )}
                        {item.isNew && (
                          <span className="new-tag"><IconStar /> Nuevo</span>
                        )}
                        {catKey === "combos" && (
                          <span className="combo-badge">🔥 Combo</span>
                        )}
                      </div>
                      {item.desc && <p className="product-desc">{item.desc}</p>}
                      {catKey === "combos" && (
                        <p className="combo-includes">
                          Incluye: {item.burger} + Papas + Bebida &nbsp;|&nbsp; Aros de cebolla +$1.000
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="product-bottom">
                    <span className="product-price">{fmt(item.price)}</span>
                    {inCartQty > 0 && isSimple ? (
                      <div className="qty-control" onClick={(e) => e.stopPropagation()}>
                        <button className="qty-btn" onClick={() => {
                          const ci = cart.find(c => c.id === item.id);
                          if (ci) updateCartQty(ci.cartId, -1);
                        }}><IconMinus /></button>
                        <span className="qty-num">{inCartQty}</span>
                        <button className="qty-btn" onClick={() => quickAdd(item, catKey)}><IconPlus /></button>
                      </div>
                    ) : (
                      <button
                        className={`add-btn ${inCartQty > 0 ? "added" : ""}`}
                        onClick={(e) => { e.stopPropagation(); quickAdd(item, catKey); }}
                      >
                        {inCartQty > 0 ? (
                          <><IconCheck /> {inCartQty} en pedido</>
                        ) : (
                          <><IconPlus /> Agregar</>
                        )}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </section>
          );
        })}

        {/* FOOTER */}
        <footer className="footer">
          <div className="footer-brand">CÓMO SERÍA</div>
          <div className="footer-loc"><IconMapPin /> Country Mall, Jamundí - Valle del Cauca</div>
          <p className="footer-copy">© 2025 Cómo Sería. Todos los derechos reservados.</p>
          <p className="footer-powered">Instagram: <a href="https://www.instagram.com/somoscomoseria" target="_blank" rel="noopener">@somoscomoseria</a></p>
        </footer>

        {/* FLOATING BAR */}
        {cartCount > 0 && !showCart && (
          <div className="float-bar">
            <div className="float-info">
              <div className="items-count">{cartCount} {cartCount === 1 ? "producto" : "productos"}</div>
              <div className="items-total">{fmt(cartTotal)}</div>
            </div>
            <button className="float-btn" id="btn-float-cart" onClick={() => setShowCart(true)}>
              Ver pedido
            </button>
          </div>
        )}

        {/* TOAST */}
        {toast && (
          <div className="toast">
            <span className="toast-icon">✓</span> {toast}
          </div>
        )}
      </div>

      {/* ─── PRODUCT DETAIL MODAL ─── */}
      {modalItem && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-handle" />
            <div className="modal-header">
              <div>
                {modalItem.special && modalItem.isBurgerMaster && (
                  <div className="modal-bm-logo-wrap">
                    <img src="/bm2026.png" alt="Burger Master 2026" className="modal-bm-logo" />
                  </div>
                )}
                <h2>{modalItem.name}</h2>
                <p>{modalItem.desc}</p>
              </div>
              <button className="modal-close" onClick={closeModal}><IconX /></button>
            </div>
            <div className="modal-body">

              {/* Imagen de la hamburguesa en modal — clic para verla en grande */}
              {modalItem.burgerImg && (
                <PositionedImage
                  src={modalItem.burgerImg}
                  alt={modalItem.name}
                  className="modal-burger-img-wrap modal-burger-img-wrap-clickable"
                  onClick={() => setZoomedImage({ src: modalItem.burgerImg, alt: modalItem.name })}
                  {...parseFramePosition(modalItem.burgerImgPosition)}
                />
              )}

              {/* Ingredientes — solo si allowCustomization no es false */}
              {modalItem.allowCustomization !== false && modalItem.ingredients && modalItem.ingredients.length > 0 && (
                <div className="modal-section">
                  <div className="modal-section-title">
                    {modalItem.category === "combos" ? "🍔 Personalizar hamburguesa" : "🥬 Ingredientes"}
                    <span className="optional">(toca para quitar)</span>
                  </div>
                  <div className="ingredient-chips">
                    {modalItem.ingredients.map((ing) => (
                      <button
                        key={ing}
                        className={`ingredient-chip ${removedIngredients.includes(ing) ? "removed" : ""}`}
                        onClick={() => toggleIngredient(ing)}
                      >
                        {removedIngredients.includes(ing) ? "✕" : "✓"} {ing}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Adiciones — solo si allowCustomization no es false */}
              {modalItem.allowCustomization !== false && (
                <div className="modal-section">
                  <div className="modal-section-title">
                    ➕ Adiciones <span className="optional">(opcional)</span>
                  </div>
                  {menuAdiciones.map((ad) => {
                    const selected = selectedAdiciones.find((a) => a.id === ad.id);
                    return (
                      <div key={ad.id} className="adicion-row" onClick={() => !selected && adjustAdicion(ad, 1)}>
                        <div className="adicion-left">
                          <div
                            className={`adicion-check ${selected ? "checked" : ""}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (selected) {
                                setSelectedAdiciones((prev) => prev.filter((a) => a.id !== ad.id));
                              } else {
                                adjustAdicion(ad, 1);
                              }
                            }}
                          >
                            {selected && <IconCheck />}
                          </div>
                          <span className="adicion-name">{ad.name}</span>
                        </div>
                        {selected ? (
                          <div className="adicion-right">
                            <div className="adicion-qty-stepper" onClick={(e) => e.stopPropagation()}>
                              <button className="adicion-qty-btn" onClick={() => adjustAdicion(ad, -1)}><IconMinus /></button>
                              <span className="adicion-qty-num">{selected.qty}</span>
                              <button className="adicion-qty-btn" onClick={() => adjustAdicion(ad, 1)}><IconPlus /></button>
                            </div>
                            <span className="adicion-price">+{fmt(ad.price * selected.qty)}</span>
                          </div>
                        ) : (
                          <span className="adicion-price">+{fmt(ad.price)}</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Selección de bebida para combos */}
              {modalItem.category === "combos" && (
                <div className="modal-section">
                  <div className="modal-section-title">
                    🥤 Bebida incluida <span className="optional">(elige una)</span>
                  </div>
                  {menuBebidas.map((bebida) => (
                    <div
                      key={bebida.id}
                      className={`adicion-row ${selectedBebida?.id === bebida.id ? "selected" : ""}`}
                      onClick={() => setSelectedBebida(bebida)}
                    >
                      <div className="adicion-left">
                        <div className={`adicion-check ${selectedBebida?.id === bebida.id ? "checked" : ""}`}>
                          {selectedBebida?.id === bebida.id && <IconCheck />}
                        </div>
                        <span className="adicion-name">
                          {bebida.name}
                          {bebida.isNew && <span className="new-tag"><IconStar /> Nuevo</span>}
                        </span>
                      </div>
                      <span className="adicion-price">{bebida.comboExtra ? `+${fmt(bebida.comboExtra)}` : "Incluido"}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Selección de acompañamiento para combos */}
              {modalItem.category === "combos" && (
                <div className="modal-section">
                  <div className="modal-section-title">
                    🍟 Acompañamiento incluido <span className="optional">(elige uno)</span>
                  </div>
                  {SIDES.map((side) => (
                    <div
                      key={side.id}
                      className={`adicion-row ${selectedSide?.id === side.id ? "selected" : ""}`}
                      onClick={() => setSelectedSide(side)}
                    >
                      <div className="adicion-left">
                        <div className={`adicion-check ${selectedSide?.id === side.id ? "checked" : ""}`}>
                          {selectedSide?.id === side.id && <IconCheck />}
                        </div>
                        <span className="adicion-name">{side.name}</span>
                      </div>
                      <span className="adicion-price">{side.price > 0 ? `+${fmt(side.price)}` : "Incluido"}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Papas Grandes - Solo para combos */}
              {modalItem.category === "combos" && (
                <div className="modal-section">
                  <div className="modal-section-title">
                    🍟 Agrandar Papas <span className="optional">(opcional)</span>
                  </div>
                  <div className="adicion-row" onClick={() => setAgrandarPapas(!agrandarPapas)}>
                    <div className="adicion-left">
                      <div className={`adicion-check ${agrandarPapas ? "checked" : ""}`}>
                        {agrandarPapas && <IconCheck />}
                      </div>
                      <span className="adicion-name">Papas Grandes</span>
                    </div>
                    <span className="adicion-price">+{fmt(2000)}</span>
                  </div>
                </div>
              )}

              <div className="modal-section">
                <div className="modal-section-title">
                  💬 Comentarios <span className="optional">(opcional)</span>
                </div>
                <textarea
                  className="comment-field"
                  placeholder="Ej: Sin salsa, bien cocida, doble pan..."
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  maxLength={200}
                />
              </div>

            </div>

            <div className="modal-footer">
              <div className="modal-qty">
                <button className="modal-qty-btn" onClick={() => setModalQty(Math.max(1, modalQty - 1))}><IconMinus /></button>
                <span className="modal-qty-num">{modalQty}</span>
                <button className="modal-qty-btn" onClick={() => setModalQty(modalQty + 1)}><IconPlus /></button>
              </div>
              <button
                className="modal-add-btn"
                id="btn-add-to-cart"
                onClick={editingCartId ? saveCartChanges : addToCart}
              >
                {editingCartId ? "Guardar cambios" : "Agregar"} {fmt((modalItem.price + selectedAdiciones.reduce((s, a) => s + a.price * a.qty, 0) + (selectedSide?.price || 0) + (agrandarPapas && modalItem.category === "combos" ? 2000 : 0) + (modalItem.category === "combos" ? (selectedBebida?.comboExtra || 0) : 0)) * modalQty)}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── ZOOM DE IMAGEN DEL PRODUCTO ─── */}
      {zoomedImage && (
        <div className="image-zoom-overlay" onClick={() => setZoomedImage(null)}>
          <button className="image-zoom-close" onClick={() => setZoomedImage(null)}><IconX /></button>
          <img src={zoomedImage.src} alt={zoomedImage.alt} className="image-zoom-img" onClick={(e) => e.stopPropagation()} />
        </div>
      )}

      {/* ─── CART MODAL ─── */}
      {showCart && (
        <div className="modal-overlay" onClick={() => setShowCart(false)}>
          <div className="modal cart-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-handle" />
            <div className="modal-header">
              <div>
                <h2>Tu Pedido</h2>
                <p>{cartCount} {cartCount === 1 ? "producto" : "productos"}</p>
              </div>
              <button className="modal-close" onClick={() => setShowCart(false)}><IconX /></button>
            </div>
            <div className="modal-body">
              {/* Customer name in cart */}
              <div className={`cart-name-field ${nameError ? "error" : ""}`}>
                <div className="cart-name-icon"><IconUser /></div>
                <input
                  className={`cart-name-input ${customerName.trim() ? "filled" : ""}`}
                  type="text"
                  placeholder="Tu nombre para el pedido..."
                  value={customerName}
                  maxLength={40}
                  onChange={(e) => {
                    setCustomerName(e.target.value);
                    if (e.target.value.trim()) setNameError(false);
                  }}
                />
                {customerName.trim() && (
                  <div className="cart-name-ok"><IconCheck /></div>
                )}
              </div>
              {nameError && (
                <p className="cart-name-error">⚠️ Ingresa tu nombre para continuar</p>
              )}

              {cart.length === 0 ? (
                <div className="cart-empty">
                  <div className="cart-empty-icon">🍔</div>
                  <p>Tu pedido está vacío.<br />¡Agrega algo delicioso!</p>
                </div>
              ) : (
                <>
                  {cart.map((item) => (
                    <div key={item.cartId} className="cart-item">
                      <div className="cart-item-info">
                        <div className="cart-item-name">{item.name} <span style={{ opacity: 0.5 }}>x{item.qty}</span></div>
                        <div className="cart-item-details">
                          {item.removedIngredients.length > 0 && (
                            <div className="removed-ing">❌ Sin: {item.removedIngredients.join(", ")}</div>
                          )}
                          {item.bebida && (
                            <div className="added-ing">
                              🥤 Bebida: {item.bebida.name}
                              {item.category === "combos" && item.bebida.comboExtra ? ` (+${fmt(item.bebida.comboExtra)})` : ''}
                            </div>
                          )}
                          {item.side && (
                            <div className="added-ing">🍟 {item.side.name}{item.side.price > 0 ? ` (+$${fmt(item.side.price)})` : ''}</div>
                          )}
                          {item.adiciones.length > 0 && (
                            <div className="added-ing">➕ {item.adiciones.map((a) => formatAdicion(a, item.qty)).join(", ")}</div>
                          )}
                          {item.agrandarPapas && (
                            <div className="added-ing">🍟 Papas Grandes (+$2.000)</div>
                          )}
                          {item.comment && <div>💬 {item.comment}</div>}
                        </div>
                      </div>
                      <div className="cart-item-right">
                        <span className="cart-item-price">{fmt(item.totalPrice * item.qty)}</span>
                        <div className="cart-item-actions">
                          <button className="cart-item-action" onClick={() => openModalForEdit(item)}><IconEdit /></button>
                          <button className="cart-item-action" onClick={() => updateCartQty(item.cartId, -1)}><IconMinus /></button>
                          <button className="cart-item-action" onClick={() => updateCartQty(item.cartId, 1)}><IconPlus /></button>
                          <button className="cart-item-action delete" onClick={() => removeFromCart(item.cartId)}><IconTrash /></button>
                        </div>
                      </div>
                    </div>
                  ))}
                  
                  {/* DELIVERY TYPE SECTION */}
                  <div className="delivery-section">
                    <div className="delivery-title">📍 Tipo de Entrega</div>
                    <div className="delivery-options">
                      <button
                        className={`delivery-btn ${deliveryType === "recoger" ? "active" : ""}`}
                        onClick={() => {
                          setDeliveryType("recoger");
                          setDeliveryLocation(null);
                          setDeliveryAddress("");
                        }}
                      >
                        Para Recoger
                      </button>
                      <button
                        className={`delivery-btn ${deliveryType === "domicilio" ? "active" : ""}`}
                        onClick={() => setDeliveryType("domicilio")}
                      >
                        Domicilio
                      </button>
                    </div>
                  </div>

                  {/* DELIVERY LOCATION SECTION */}
                  {deliveryType === "domicilio" && (
                    <div className="delivery-location-section">
                      <div className="delivery-subtitle">Selecciona una ubicación:</div>
                      {DELIVERY_LOCATIONS.map((loc) => (
                        <div
                          key={loc.id}
                          className={`delivery-location-btn ${deliveryLocation?.id === loc.id ? "selected" : ""}`}
                          onClick={() => setDeliveryLocation(loc)}
                        >
                          <div className="location-name">{loc.name}</div>
                          <div className="location-price">+{fmt(loc.price)}</div>
                        </div>
                      ))}
                      
                      {/* ADDRESS INPUT */}
                      <div className="address-input-wrap">
                        <label className="address-label">Dirección de entrega:</label>
                        <input
                          type="text"
                          className="address-input"
                          placeholder="Ingresa la dirección completa..."
                          value={deliveryAddress}
                          onChange={(e) => setDeliveryAddress(e.target.value)}
                          maxLength={200}
                        />
                      </div>
                    </div>
                  )}

                  <div className="payment-section">
                    <div className="delivery-title">💳 Método de Pago</div>
                    <div className="payment-options">
                      {paymentMethods.map((method) => (
                        <button
                          key={method.id}
                          className={`delivery-btn ${paymentMethod === method.id ? "active" : ""}`}
                          onClick={() => setPaymentMethod(method.id)}
                        >
                          {method.label}
                        </button>
                      ))}
                    </div>
                    {selectedPaymentAccounts.length > 0 && (
                      <div className="payment-accounts">
                        {selectedPaymentAccounts.map((acc) => (
                          <div key={acc.label} className="payment-account-row">
                            <div className="payment-account-info">
                              <span className="payment-account-label">{acc.label}</span>
                              <span className="payment-account-value">{acc.value}</span>
                            </div>
                            <button
                              type="button"
                              className="payment-account-copy"
                              onClick={() => copyToClipboard(acc.value)}
                            >
                              📋 Copiar
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {deliveryType === "domicilio" && deliveryLocation ? (
                    <div className="cart-totals-breakdown">
                      <div className="cart-subtotal-row">
                        <span className="cart-subtotal-label">Subtotal</span>
                        <span className="cart-subtotal-price">{fmt(cartTotal)}</span>
                      </div>
                      <div className="cart-delivery-row">
                        <span className="cart-delivery-label">🛵 Domicilio ({deliveryLocation.name})</span>
                        <span className="cart-delivery-price">{fmt(deliveryLocation.price)}</span>
                      </div>
                      <div className="cart-total-row">
                        <span className="cart-total-label">TOTAL</span>
                        <span className="cart-total-price">{fmt(cartTotal + deliveryLocation.price)}</span>
                      </div>
                    </div>
                  ) : (
                    <div className="cart-total-row">
                      <span className="cart-total-label">TOTAL</span>
                      <span className="cart-total-price">{fmt(cartTotal)}</span>
                    </div>
                  )}
                  <button
                    className={`cart-wa-btn ${!customerName.trim() || (deliveryType === "domicilio" && (!deliveryLocation || !deliveryAddress.trim())) || !paymentMethod ? "disabled" : ""}`}
                    id="btn-send-whatsapp"
                    onClick={sendToWhatsApp}
                  >
                    <IconWhatsapp /> Enviar pedido por WhatsApp
                  </button>
                  {!customerName.trim() && (
                    <p className="wa-btn-hint">Escribe tu nombre arriba para enviar el pedido</p>
                  )}
                  {deliveryType === "domicilio" && (!deliveryLocation || !deliveryAddress.trim()) && (
                    <p className="wa-btn-hint">Selecciona ubicación e ingresa dirección para domicilio</p>
                  )}
                  {!paymentMethod && (
                    <p className="wa-btn-hint">Selecciona un método de pago antes de enviar el pedido</p>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
