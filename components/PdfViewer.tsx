"use client";

// ─────────────────────────────────────────────────────────────────────────────
// Visualizador de PDF. Renderiza a página atual num <canvas> usando pdfClient,
// expõe o renderScale ao componente pai (para conversões coord PDF<->pixel) e
// permite sobrepor camadas (calibração, revisão) via children posicionados.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useRef, useState, type ReactNode } from "react";
import { renderPageToCanvas } from "@/lib/pdfClient";
import type { PageMeta } from "@/lib/types";

interface PdfViewerProps {
  fileData: ArrayBuffer | Uint8Array;
  pages: PageMeta[];
  pageIndex: number;
  scale: number;
  onPageChange: (index: number) => void;
  /** Notifica o pai sobre o renderScale (px do canvas por unidade PDF). */
  onRenderScale?: (renderScale: number) => void;
  /** Camadas sobrepostas ao canvas (ex.: overlay de calibração/revisão). */
  children?: ReactNode;
  /** Ref do container do canvas, útil para capturar cliques relativos. */
  canvasRef?: React.RefObject<HTMLCanvasElement | null>;
}

export default function PdfViewer({
  fileData,
  pages,
  pageIndex,
  scale,
  onPageChange,
  onRenderScale,
  children,
  canvasRef,
}: PdfViewerProps) {
  const internalRef = useRef<HTMLCanvasElement>(null);
  const canvas = canvasRef ?? internalRef;
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);

  const meta = pages[pageIndex];

  useEffect(() => {
    let cancelado = false;
    async function desenhar() {
      if (!canvas.current) return;
      setCarregando(true);
      setErro(null);
      try {
        const { renderScale } = await renderPageToCanvas(
          fileData,
          pageIndex,
          canvas.current,
          scale,
        );
        if (!cancelado) onRenderScale?.(renderScale);
      } catch (e) {
        if (!cancelado) {
          setErro(
            "Falha ao renderizar a página: " +
              (e instanceof Error ? e.message : String(e)),
          );
        }
      } finally {
        if (!cancelado) setCarregando(false);
      }
    }
    void desenhar();
    return () => {
      cancelado = true;
    };
  }, [fileData, pageIndex, scale, canvas, onRenderScale]);

  return (
    <div className="flex h-full flex-col">
      {/* Barra de navegação de páginas */}
      <div className="flex items-center gap-3 border-b border-slate-200 bg-white px-3 py-2">
        <button
          type="button"
          className="rounded border border-slate-300 px-3 py-1 text-sm disabled:opacity-40"
          onClick={() => onPageChange(Math.max(0, pageIndex - 1))}
          disabled={pageIndex <= 0}
        >
          ◀ Anterior
        </button>
        <span className="text-sm text-slate-600">
          Página {pageIndex + 1} de {pages.length}
        </span>
        <button
          type="button"
          className="rounded border border-slate-300 px-3 py-1 text-sm disabled:opacity-40"
          onClick={() => onPageChange(Math.min(pages.length - 1, pageIndex + 1))}
          disabled={pageIndex >= pages.length - 1}
        >
          Próximo ▶
        </button>

        {/* Badge vetorial / raster */}
        {meta && (
          <span
            className={
              "ml-auto rounded px-2 py-0.5 text-xs font-medium " +
              (meta.isVector
                ? "bg-emerald-100 text-emerald-700"
                : "bg-amber-100 text-amber-700")
            }
            title={
              meta.isVector
                ? "Página com conteúdo vetorial (extração geométrica disponível)"
                : "Página raster/escaneada (sem geometria vetorial)"
            }
          >
            {meta.isVector ? "Vetorial" : "Raster"}
          </span>
        )}
      </div>

      {/* Área de desenho, com scroll. O overlay (children) é posicionado sobre o canvas. */}
      <div className="relative flex-1 overflow-auto bg-slate-100 p-4">
        {erro && (
          <div className="mb-2 rounded bg-red-100 px-3 py-2 text-sm text-red-700">
            {erro}
          </div>
        )}
        {carregando && (
          <div className="absolute left-4 top-4 z-10 rounded bg-slate-800/80 px-2 py-1 text-xs text-white">
            Renderizando…
          </div>
        )}
        <div className="relative inline-block">
          <canvas
            ref={canvas}
            className="block border border-slate-300 bg-white shadow"
          />
          {/* Camadas sobrepostas (calibração, revisão) recebem o mesmo box do canvas. */}
          {children}
        </div>
      </div>
    </div>
  );
}
