"use client";

// ─────────────────────────────────────────────────────────────────────────────
// Overlay de destaque. Ao passar o mouse num quantitativo, desenha sobre o canvas
// os itens usados naquele cálculo:
//   • room  → marcador na posição do rótulo de área (e polígono, se houver)
//   • allRooms → todos os marcadores de ambiente da página (p/ "área total")
//   • walls → todos os segmentos contados como parede
// Não captura eventos (pointer-events: none).
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useRef } from "react";
import type { ExtractionResult } from "@/lib/types";

export type HighlightTarget =
  | { pageIndex: number; kind: "room"; roomId: string }
  | { pageIndex: number; kind: "allRooms" }
  | { pageIndex: number; kind: "walls" };

interface Props {
  canvasW: number;
  canvasH: number;
  renderScale: number;
  pdfHeight: number;
  result: ExtractionResult | null;
  highlight: HighlightTarget | null;
}

export default function HighlightOverlay({
  canvasW,
  canvasH,
  renderScale,
  pdfHeight,
  result,
  highlight,
}: Props) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.width = canvasW;
    el.height = canvasH;
    const ctx = el.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, el.width, el.height);

    if (!result || !highlight || highlight.pageIndex !== result.pageIndex) return;

    const toPx = (x: number, y: number): [number, number] => [
      x * renderScale,
      (pdfHeight - y) * renderScale,
    ];

    const marker = (x: number, y: number, label?: string) => {
      const [px, py] = toPx(x, y);
      ctx.fillStyle = "rgba(37, 99, 235, 0.18)";
      ctx.strokeStyle = "#2563eb";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(px, py, 12, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      if (label) {
        ctx.fillStyle = "#1e3a8a";
        ctx.font = "12px sans-serif";
        ctx.fillText(label, px + 14, py + 4);
      }
    };

    if (highlight.kind === "walls") {
      ctx.strokeStyle = "#f59e0b";
      ctx.lineWidth = 3;
      ctx.globalAlpha = 0.9;
      for (const s of result.walls.segments) {
        const [x1, y1] = toPx(s.x1, s.y1);
        const [x2, y2] = toPx(s.x2, s.y2);
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      return;
    }

    if (highlight.kind === "allRooms") {
      for (const r of result.rooms) {
        if (r.textPos) marker(r.textPos.x, r.textPos.y);
      }
      return;
    }

    // kind === "room"
    const room = result.rooms.find((r) => r.id === highlight.roomId);
    if (!room) return;
    if (room.polygon && room.polygon.length > 1) {
      ctx.strokeStyle = "#2563eb";
      ctx.fillStyle = "rgba(37, 99, 235, 0.15)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      room.polygon.forEach((p, i) => {
        const [px, py] = toPx(p.x, p.y);
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      });
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
    if (room.textPos) marker(room.textPos.x, room.textPos.y, room.label);
  }, [canvasW, canvasH, renderScale, pdfHeight, result, highlight]);

  return <canvas ref={ref} className="pointer-events-none absolute left-0 top-0" />;
}
