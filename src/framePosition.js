// Formato guardado: "X% Y% ZOOM" (ej. "50% 50% 1.4"). Compatible con el
// formato viejo de solo 2 valores ("50% 50%"), que se trata como zoom 1.
export function parseFramePosition(value) {
  const parts = String(value || "").trim().split(/\s+/);
  const x = parseFloat(parts[0]) || 50;
  const y = parseFloat(parts[1]) || 50;
  const zoom = parts[2] ? parseFloat(parts[2]) || 1 : 1;
  return { x, y, zoom };
}

export function serializeFramePosition({ x, y, zoom }) {
  return `${x}% ${y}% ${zoom}`;
}

// 1 = justo lo necesario para cubrir el recuadro (como "object-fit: cover").
// 0.25 deja achicarla bastante más allá de eso, hasta casi verse completa
// (con el fondo oscuro rellenando los espacios que sobren), para fotos muy
// verticales en un recuadro ancho y bajo como el del menú.
export const MIN_ZOOM = 0.25;
export const MAX_ZOOM = 3;

export function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v));
}

// La imagen se escala primero lo mínimo necesario para cubrir el recuadro,
// y el zoom es un multiplicador extra sobre esa base — así 1 = ajuste
// normal, 2 = el doble de acercado, 0.5 = la mitad, etc. Si con el zoom
// elegido la imagen queda MÁS chica que el recuadro en algún eje, se centra
// en ese eje en vez de arrastrarla, ya no hay nada que recorrer ahí.
export function computeFrameTransform(containerRect, naturalW, naturalH, x, y, zoom) {
  if (!containerRect.width || !containerRect.height || !naturalW || !naturalH) return null;
  const baseScale = Math.max(containerRect.width / naturalW, containerRect.height / naturalH);
  const scale = baseScale * zoom;
  const renderedW = naturalW * scale;
  const renderedH = naturalH * scale;
  const rawOverflowX = renderedW - containerRect.width;
  const rawOverflowY = renderedH - containerRect.height;
  const overflowX = Math.max(0, rawOverflowX);
  const overflowY = Math.max(0, rawOverflowY);
  return {
    width: renderedW,
    height: renderedH,
    left: overflowX > 0 ? -(overflowX * (x / 100)) : (containerRect.width - renderedW) / 2,
    top: overflowY > 0 ? -(overflowY * (y / 100)) : (containerRect.height - renderedH) / 2,
    overflowX,
    overflowY,
  };
}
