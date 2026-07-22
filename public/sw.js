// Service worker del panel de admin. Dos trabajos:
// 1. Mostrar notificaciones locales (en Android, la mayoría de navegadores
//    no soportan crear notificaciones directamente desde el código de la
//    página con `new Notification`, solo vía `registration.showNotification`).
// 2. Recibir los push reales que manda el servidor cuando llega un pedido
//    nuevo — esto sigue funcionando aunque la pestaña esté minimizada o el
//    admin esté en otra app (mientras el navegador siga corriendo).
// No usa caché de archivos, así que no interfiere con el resto de la app.

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let data = { title: "🔔 Nuevo pedido — Cómo Sería", body: "", orderId: null };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch {
    // si el payload no es JSON válido, se muestra el mensaje genérico
  }
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: "/logo.png",
      tag: data.orderId ? `order-${data.orderId}` : undefined,
      data: { orderId: data.orderId },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  const orderId = event.notification.data?.orderId || null;
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        client.postMessage({ type: "notification-click", orderId });
        if ("focus" in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow("/admin");
      return undefined;
    })
  );
});
