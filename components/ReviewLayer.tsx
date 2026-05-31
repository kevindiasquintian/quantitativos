"use client";

// ─────────────────────────────────────────────────────────────────────────────
// Camada de revisão do ExtractionResult. Apresenta tabelas editáveis de
// ambientes, parede, contagens e revestimentos, e desenha um overlay sobre o
// canvas destacando posições (textPos de ambientes e positions de contagens).
//
// Conversão de coordenadas PDF -> pixel do canvas:
//   px_x = pdf_x * renderScale
//   px_y = (pdfHeight - pdf_y) * renderScale   (pdf.js: origem inferior-esquerda)
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useRef } from "react";
import type { ExtractionResult, RoomArea, CountResult } from "@/lib/types";

interface ReviewLayerProps {
  result: ExtractionResult;
  onChange: (r: ExtractionResult) => void;
  /** px do canvas por unidade PDF. */
  renderScale: number;
  /** altura da página em unidades PDF (para inverter o eixo Y). */
  pdfHeight: number;
  /** largura/altura do canvas em pixels (para dimensionar o overlay). */
  canvasWidth: number;
  canvasHeight: number;
}

export default function ReviewLayer({
  result,
  onChange,
  renderScale,
  pdfHeight,
  canvasWidth,
  canvasHeight,
}: ReviewLayerProps) {
  // ── Overlay ────────────────────────────────────────────────────────────────
  const overlayRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const cv = overlayRef.current;
    if (!cv) return;
    cv.width = canvasWidth;
    cv.height = canvasHeight;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, cv.width, cv.height);

    const toPx = (x: number, y: number): [number, number] => [
      x * renderScale,
      (pdfHeight - y) * renderScale,
    ];

    // Ambientes (textPos) em azul.
    ctx.fillStyle = "rgba(37, 99, 235, 0.85)";
    ctx.strokeStyle = "rgba(37, 99, 235, 0.85)";
    ctx.font = "11px sans-serif";
    for (const r of result.rooms) {
      if (!r.textPos) continue;
      const [px, py] = toPx(r.textPos.x, r.textPos.y);
      ctx.beginPath();
      ctx.arc(px, py, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillText(r.label || r.id, px + 7, py + 3);
    }

    // Contagens (positions) em vermelho.
    ctx.fillStyle = "rgba(220, 38, 38, 0.85)";
    for (const c of result.counts) {
      for (const p of c.positions ?? []) {
        const [px, py] = toPx(p.x, p.y);
        ctx.beginPath();
        ctx.arc(px, py, 4, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }, [result, renderScale, pdfHeight, canvasWidth, canvasHeight]);

  // ── Edição de ambientes ──────────────────────────────────────────────────────
  function updateRoom(i: number, campo: "label" | "areaM2", v: string) {
    const rooms = result.rooms.map((r, idx) => {
      if (idx !== i) return r;
      if (campo === "areaM2") {
        return { ...r, areaM2: parseFloat(v.replace(",", ".")) || 0 };
      }
      return { ...r, label: v };
    });
    onChange({ ...result, rooms });
  }
  function addRoom() {
    const novo: RoomArea = {
      id: "manual-" + Date.now().toString(36),
      label: "",
      areaM2: 0,
      source: "manual",
    };
    onChange({ ...result, rooms: [...result.rooms, novo] });
  }
  function removeRoom(i: number) {
    onChange({ ...result, rooms: result.rooms.filter((_, idx) => idx !== i) });
  }

  // ── Edição de parede ─────────────────────────────────────────────────────────
  function setWallLength(v: string) {
    onChange({
      ...result,
      walls: {
        ...result.walls,
        totalLengthM: parseFloat(v.replace(",", ".")) || 0,
      },
    });
  }

  // ── Edição de contagens ───────────────────────────────────────────────────────
  function updateCount(i: number, campo: "name" | "count", v: string) {
    const counts = result.counts.map((c, idx) => {
      if (idx !== i) return c;
      if (campo === "count") {
        return { ...c, count: parseInt(v, 10) || 0 };
      }
      return { ...c, name: v };
    });
    onChange({ ...result, counts });
  }
  function addCount() {
    const novo: CountResult = { name: "", count: 0 };
    onChange({ ...result, counts: [...result.counts, novo] });
  }
  function removeCount(i: number) {
    onChange({ ...result, counts: result.counts.filter((_, idx) => idx !== i) });
  }

  // ── Edição de revestimentos ───────────────────────────────────────────────────
  function updateFinish(i: number, campo: "baseAreaM2" | "lossPct", v: string) {
    const finishes = result.finishes.map((f, idx) => {
      if (idx !== i) return f;
      const num = parseFloat(v.replace(",", ".")) || 0;
      const baseAreaM2 = campo === "baseAreaM2" ? num : f.baseAreaM2;
      const lossPct = campo === "lossPct" ? num / 100 : f.lossPct;
      return {
        ...f,
        baseAreaM2,
        lossPct,
        totalAreaM2: baseAreaM2 * (1 + lossPct),
      };
    });
    onChange({ ...result, finishes });
  }

  return (
    <div className="space-y-4">
      {/* Overlay opcional: só é desenhado quando o pai fornece dimensões > 0
          e posiciona o container. No layout atual o overlay visível é tratado
          diretamente na página (sobre o canvas), então aqui fica oculto. */}
      {canvasWidth > 0 && canvasHeight > 0 && (
        <canvas
          ref={overlayRef}
          className="pointer-events-none absolute left-0 top-0"
        />
      )}

      {/* Tabela de ambientes */}
      <section className="rounded border border-slate-200 bg-white p-3">
        <h3 className="mb-2 text-sm font-semibold text-slate-700">Ambientes</h3>
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-slate-500">
              <th className="pb-1">Rótulo</th>
              <th className="pb-1">Área (m²)</th>
              <th className="pb-1">Origem</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {result.rooms.map((r, i) => (
              <tr key={r.id}>
                <td className="pr-2">
                  <input
                    type="text"
                    value={r.label}
                    onChange={(e) => updateRoom(i, "label", e.target.value)}
                    className="w-full rounded border border-slate-300 px-2 py-1"
                  />
                </td>
                <td className="pr-2">
                  <input
                    type="number"
                    step="0.01"
                    value={r.areaM2}
                    onChange={(e) => updateRoom(i, "areaM2", e.target.value)}
                    className="w-24 rounded border border-slate-300 px-2 py-1"
                  />
                </td>
                <td className="pr-2 text-slate-400">{r.source}</td>
                <td>
                  <button
                    type="button"
                    onClick={() => removeRoom(i)}
                    className="rounded px-2 py-1 text-red-600 hover:bg-red-50"
                  >
                    ✕
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <button
          type="button"
          onClick={addRoom}
          className="mt-2 rounded border border-slate-300 px-2 py-1 text-xs text-slate-700"
        >
          + Adicionar ambiente
        </button>
      </section>

      {/* Parede */}
      <section className="rounded border border-slate-200 bg-white p-3">
        <h3 className="mb-2 text-sm font-semibold text-slate-700">Parede</h3>
        <div className="flex items-center gap-2 text-xs">
          <label>Comprimento total (m):</label>
          <input
            type="number"
            step="0.01"
            value={result.walls.totalLengthM}
            onChange={(e) => setWallLength(e.target.value)}
            className="w-28 rounded border border-slate-300 px-2 py-1"
          />
          <span className="text-slate-400">
            ({result.walls.segments.length} segmentos detectados)
          </span>
        </div>
      </section>

      {/* Contagens */}
      <section className="rounded border border-slate-200 bg-white p-3">
        <h3 className="mb-2 text-sm font-semibold text-slate-700">Contagens</h3>
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-slate-500">
              <th className="pb-1">Nome</th>
              <th className="pb-1">Qtd.</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {result.counts.map((c, i) => (
              <tr key={i}>
                <td className="pr-2">
                  <input
                    type="text"
                    value={c.name}
                    onChange={(e) => updateCount(i, "name", e.target.value)}
                    className="w-full rounded border border-slate-300 px-2 py-1"
                  />
                </td>
                <td className="pr-2">
                  <input
                    type="number"
                    step="1"
                    value={c.count}
                    onChange={(e) => updateCount(i, "count", e.target.value)}
                    className="w-20 rounded border border-slate-300 px-2 py-1"
                  />
                </td>
                <td>
                  <button
                    type="button"
                    onClick={() => removeCount(i)}
                    className="rounded px-2 py-1 text-red-600 hover:bg-red-50"
                  >
                    ✕
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <button
          type="button"
          onClick={addCount}
          className="mt-2 rounded border border-slate-300 px-2 py-1 text-xs text-slate-700"
        >
          + Adicionar contagem
        </button>
      </section>

      {/* Revestimentos (editáveis: área-base e perda; total recalculado) */}
      <section className="rounded border border-slate-200 bg-white p-3">
        <h3 className="mb-2 text-sm font-semibold text-slate-700">Revestimentos</h3>
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-slate-500">
              <th className="pb-1">Nome</th>
              <th className="pb-1">Área-base (m²)</th>
              <th className="pb-1">Perda (%)</th>
              <th className="pb-1">Total (m²)</th>
            </tr>
          </thead>
          <tbody>
            {result.finishes.map((f, i) => (
              <tr key={i}>
                <td className="pr-2 text-slate-700">{f.name}</td>
                <td className="pr-2">
                  <input
                    type="number"
                    step="0.01"
                    value={f.baseAreaM2}
                    onChange={(e) => updateFinish(i, "baseAreaM2", e.target.value)}
                    className="w-24 rounded border border-slate-300 px-2 py-1"
                  />
                </td>
                <td className="pr-2">
                  <input
                    type="number"
                    step="1"
                    value={Math.round(f.lossPct * 100)}
                    onChange={(e) => updateFinish(i, "lossPct", e.target.value)}
                    className="w-16 rounded border border-slate-300 px-2 py-1"
                  />
                </td>
                <td className="pr-2 font-medium text-slate-700">
                  {f.totalAreaM2.toFixed(2)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {result.finishes.length === 0 && (
          <p className="text-xs text-slate-400">Nenhum revestimento calculado.</p>
        )}
      </section>
    </div>
  );
}
