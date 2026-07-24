import { useCallback, useEffect, useRef, useState } from "react";
import { MIN_ZOOM, MAX_ZOOM, clamp, computeFrameTransform } from "./framePosition.js";

function useFrameTransform(x, y, zoom) {
  const containerRef = useRef(null);
  const imgRef = useRef(null);
  const [transform, setTransform] = useState(null);

  const recompute = useCallback(() => {
    const container = containerRef.current;
    const img = imgRef.current;
    if (!container || !img || !img.naturalWidth) return;
    const rect = container.getBoundingClientRect();
    setTransform(computeFrameTransform(rect, img.naturalWidth, img.naturalHeight, x, y, zoom));
  }, [x, y, zoom]);

  useEffect(() => {
    recompute();
  }, [recompute]);

  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver(recompute);
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, [recompute]);

  return { containerRef, imgRef, transform, recompute };
}

// Muestra la foto ya encuadrada (posición + zoom guardados) dentro de un
// recuadro de tamaño fijo/responsivo — se usa en el menú público para que
// el resultado final coincida con lo que se ajustó en el editor del admin.
export function PositionedImage({ src, alt, x, y, zoom, className, style, onClick }) {
  const { containerRef, imgRef, transform, recompute } = useFrameTransform(x, y, zoom);

  return (
    <div ref={containerRef} className={className} style={{ ...style, position: "relative", overflow: "hidden" }} onClick={onClick}>
      <img
        ref={imgRef}
        src={src}
        alt={alt}
        onLoad={recompute}
        draggable={false}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          display: "block",
          ...(transform
            ? { width: transform.width, height: transform.height, transform: `translate(${transform.left}px, ${transform.top}px)` }
            : { width: "100%", height: "100%", objectFit: "cover" }),
        }}
      />
    </div>
  );
}

// Editor interactivo: arrastrar para mover (Pointer Events — funciona igual
// con mouse o con el dedo en el celular, sin código aparte para touch) + un
// control deslizante para el zoom (más confiable en mobile que un gesto de
// pellizcar, que requiere seguir dos dedos a la vez).
export function ImageFrameEditor({ src, x, y, zoom, onChange }) {
  const { containerRef, imgRef, transform, recompute } = useFrameTransform(x, y, zoom);
  const dragRef = useRef(null);

  const handlePointerDown = (e) => {
    if (!transform) return;
    e.preventDefault();
    dragRef.current = { startX: e.clientX, startY: e.clientY, startPos: { x, y }, overflowX: transform.overflowX, overflowY: transform.overflowY };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };

  const handlePointerMove = (e) => {
    const d = dragRef.current;
    if (!d) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    const nx = d.overflowX > 0 ? clamp(d.startPos.x - (dx / d.overflowX) * 100, 0, 100) : 50;
    const ny = d.overflowY > 0 ? clamp(d.startPos.y - (dy / d.overflowY) * 100, 0, 100) : 50;
    onChange({ x: nx, y: ny, zoom });
  };

  const handlePointerUp = () => {
    dragRef.current = null;
  };

  return (
    <div className="adm-image-positioner-wrap">
      <div
        ref={containerRef}
        className="adm-image-positioner"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        <img
          ref={imgRef}
          src={src}
          alt="Arrastra para reposicionar"
          onLoad={recompute}
          draggable={false}
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            display: "block",
            ...(transform
              ? { width: transform.width, height: transform.height, transform: `translate(${transform.left}px, ${transform.top}px)` }
              : { width: "100%", height: "100%", objectFit: "cover" }),
          }}
        />
        <span className="adm-image-positioner-hint">✥ Arrastra para mover</span>
      </div>
      <label className="adm-image-zoom-slider">
        🔍
        <input
          type="range"
          min={MIN_ZOOM}
          max={MAX_ZOOM}
          step={0.05}
          value={zoom}
          onChange={(e) => onChange({ x, y, zoom: parseFloat(e.target.value) })}
        />
      </label>
    </div>
  );
}
