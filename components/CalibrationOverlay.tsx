"use client";

// ─────────────────────────────────────────────────────────────────────────────
// Overlay de calibração por desenho.
// O usuário arrasta uma linha sobre uma medida conhecida; a linha trava em
// múltiplos de 15° (inclui ortogonal). Ao soltar, informa o comprimento real e
// calculamos: metersPerUnit = metrosReais / (comprimentoEmPixels / renderScale).
// A linha fica visível o tempo todo (rubber-band) sobre o canvas.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";

interface Pt {
  x: number;
  y: number;
}

interface Props {
  active: boolean;
  canvasW: number;
  canvasH: number;
  /** px do canvas por unidade PDF. */
  renderScale: number;
  onCalibrated: (metersPerUnit: number) => void;
  onCancel: () => void;
}

const SNAP_RAD = (15 * Math.PI) / 180; // passo de 15°

/** Trava o ponto final em múltiplos de 15° em relação ao ponto inicial. */
function snap(start: Pt, raw: Pt): Pt {
  const dx = raw.x - start.x;
  const dy = raw.y - start.y;
  const dist = Math.hypot(dx, dy);
  if (dist === 0) return raw;
  const ang = Math.atan2(dy, dx);
  const snapped = Math.round(ang / SNAP_RAD) * SNAP_RAD;
  return { x: start.x + Math.cos(snapped) * dist, y: start.y + Math.sin(snapped) * dist };
}

export default function CalibrationOverlay({
  active,
  canvasW,
  canvasH,
  renderScale,
  onCalibrated,
  onCancel,
}: Props) {
  const cv = useRef<HTMLCanvasElement>(null);
  const [start, setStart] = useState<Pt | null>(null);
  const [end, setEnd] = useState<Pt | null>(null);
  const [dragging, setDragging] = useState(false);
  const [metros, setMetros] = useState("");
  const [erro, setErro] = useState<string | null>(null);

  // Converte um evento de mouse para coordenadas em pixels do canvas.
  const toCanvas = useCallback((ev: React.MouseEvent): Pt => {
    const el = cv.current!;
    const rect = el.getBoundingClientRect();
    const sx = el.width / rect.width;
    const sy = el.height / rect.height;
    return { x: (ev.clientX - rect.left) * sx, y: (ev.clientY - rect.top) * sy };
  }, []);

  // Reseta quando ativa/desativa.
  useEffect(() => {
    if (!active) {
      setStart(null);
      setEnd(null);
      setDragging(false);
      setMetros("");
      setErro(null);
    }
  }, [active]);

  // Desenha a linha viva.
  useEffect(() => {
    const el = cv.current;
    if (!el) return;
    el.width = canvasW;
    el.height = canvasH;
    const ctx = el.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, el.width, el.height);
    if (!start || !end) return;

    ctx.strokeStyle = "#dc2626";
    ctx.fillStyle = "#dc2626";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(end.x, end.y);
    ctx.stroke();
    for (const p of [start, end]) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
      ctx.fill();
    }

    // Rótulo com o comprimento em unidades PDF.
    const distPx = Math.hypot(end.x - start.x, end.y - start.y);
    const distUn = renderScale > 0 ? distPx / renderScale : 0;
    const mx = (start.x + end.x) / 2;
    const my = (start.y + end.y) / 2;
    ctx.font = "12px sans-serif";
    ctx.fillStyle = "#111827";
    const label = `${distUn.toFixed(1)} un. PDF`;
    const w = ctx.measureText(label).width;
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.fillRect(mx + 6, my - 16, w + 8, 16);
    ctx.fillStyle = "#111827";
    ctx.fillText(label, mx + 10, my - 4);
  }, [start, end, canvasW, canvasH, renderScale]);

  function aplicar() {
    setErro(null);
    const m = parseFloat(metros.replace(",", "."));
    if (!start || !end) {
      setErro("Desenhe a linha de referência primeiro.");
      return;
    }
    if (!Number.isFinite(m) || m <= 0) {
      setErro("Informe o comprimento real em metros (> 0).");
      return;
    }
    const distPx = Math.hypot(end.x - start.x, end.y - start.y);
    const distUn = renderScale > 0 ? distPx / renderScale : 0;
    if (distUn <= 0) {
      setErro("Linha de comprimento nulo. Desenhe novamente.");
      return;
    }
    onCalibrated(m / distUn);
  }

  if (!active) return null;

  return (
    <>
      <canvas
        ref={cv}
        className="absolute left-0 top-0 cursor-crosshair"
        onMouseDown={(e) => {
          const p = toCanvas(e);
          setStart(p);
          setEnd(p);
          setDragging(true);
          setMetros("");
        }}
        onMouseMove={(e) => {
          if (!dragging || !start) return;
          setEnd(snap(start, toCanvas(e)));
        }}
        onMouseUp={() => setDragging(false)}
      />

      {/* Caixa flutuante: informar o comprimento real. */}
      <div className="absolute left-2 top-2 w-64 rounded border border-slate-300 bg-white/95 p-2 text-xs shadow">
        <p className="mb-1 font-semibold text-slate-700">Calibrar pela linha</p>
        <p className="mb-2 text-slate-500">
          Arraste sobre uma medida conhecida (trava a cada 15°). Depois informe o
          comprimento real.
        </p>
        <div className="flex items-center gap-2">
          <label className="whitespace-nowrap">Comprimento (m):</label>
          <input
            type="text"
            inputMode="decimal"
            value={metros}
            onChange={(e) => setMetros(e.target.value)}
            placeholder="ex.: 5.00"
            className="w-20 rounded border border-slate-300 px-2 py-1"
          />
        </div>
        <div className="mt-2 flex gap-2">
          <button
            type="button"
            onClick={aplicar}
            className="rounded bg-emerald-600 px-3 py-1 text-white"
          >
            Aplicar escala
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="rounded border border-slate-300 px-3 py-1"
          >
            Cancelar
          </button>
        </div>
        {erro && <p className="mt-1 text-red-600">{erro}</p>}
      </div>
    </>
  );
}
