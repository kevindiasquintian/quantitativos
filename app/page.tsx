"use client";

// ─────────────────────────────────────────────────────────────────────────────
// Página principal (cliente). Orquestra o fluxo:
//   1) upload do PDF (render local + POST /api/upload)
//   2) visualização e navegação de páginas
//   3) calibração de escala
//   4) edição de premissas
//   5) extração (POST /api/extract)
//   6) revisão editável do resultado
//   7) exportação da planilha (POST /api/export)
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import PdfViewer from "@/components/PdfViewer";
import CalibrationTool from "@/components/CalibrationTool";
import PremissasPanel from "@/components/PremissasPanel";
import ReviewLayer from "@/components/ReviewLayer";
import { defaultPremissas, type Premissas } from "@/lib/premissas";
import type {
  Calibration,
  ExtractionResult,
  ExportPayload,
  PageMeta,
  UploadResult,
} from "@/lib/types";

export default function Home() {
  // Estado do documento.
  const [projectName, setProjectName] = useState("Projeto");
  const [docId, setDocId] = useState<string | null>(null);
  const [pages, setPages] = useState<PageMeta[]>([]);
  const [arrayBuffer, setArrayBuffer] = useState<ArrayBuffer | null>(null);
  const [pageIndex, setPageIndex] = useState(0);
  const [scale, setScale] = useState(1.5);

  // Estado de render/calibração.
  const [renderScale, setRenderScale] = useState(1);
  const [calibration, setCalibration] = useState<Calibration | null>(null);

  // Premissas e resultado.
  const [premissas, setPremissas] = useState<Premissas>(defaultPremissas);
  const [resultado, setResultado] = useState<ExtractionResult | null>(null);

  // UI.
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);

  const meta = pages[pageIndex];

  // ── 1) Upload ────────────────────────────────────────────────────────────────
  async function handleUpload(file: File) {
    setErro(null);
    setOcupado(true);
    try {
      const buf = await file.arrayBuffer();
      setArrayBuffer(buf);
      setPageIndex(0);
      setResultado(null);
      setCalibration(null);

      const fd = new FormData();
      fd.append("file", file);
      const resp = await fetch("/api/upload", { method: "POST", body: fd });
      if (!resp.ok) {
        throw new Error("O servidor recusou o upload (HTTP " + resp.status + ").");
      }
      const data: UploadResult = await resp.json();
      setDocId(data.docId);
      setPages(data.pages);
      if (!projectName || projectName === "Projeto") {
        setProjectName(data.fileName.replace(/\.pdf$/i, "") || "Projeto");
      }
    } catch (e) {
      setErro(
        "Falha no upload: " + (e instanceof Error ? e.message : String(e)),
      );
    } finally {
      setOcupado(false);
    }
  }

  // ── 5) Extração ───────────────────────────────────────────────────────────────
  async function handleExtract() {
    if (!docId || !calibration) return;
    setErro(null);
    setOcupado(true);
    try {
      const resp = await fetch("/api/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ docId, pageIndex, calibration, premissas }),
      });
      if (!resp.ok) {
        throw new Error("Extração falhou (HTTP " + resp.status + ").");
      }
      const data: ExtractionResult = await resp.json();
      setResultado(data);
    } catch (e) {
      setErro(
        "Falha na extração: " + (e instanceof Error ? e.message : String(e)),
      );
    } finally {
      setOcupado(false);
    }
  }

  // ── 7) Exportação ─────────────────────────────────────────────────────────────
  async function handleExport() {
    if (!resultado) return;
    setErro(null);
    setOcupado(true);
    try {
      const payload: ExportPayload = {
        projectName: projectName || "Projeto",
        premissas,
        pages: [resultado],
      };
      const resp = await fetch("/api/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!resp.ok) {
        throw new Error("Exportação falhou (HTTP " + resp.status + ").");
      }
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = (projectName || "Projeto") + ".xlsx";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setErro(
        "Falha na exportação: " + (e instanceof Error ? e.message : String(e)),
      );
    } finally {
      setOcupado(false);
    }
  }

  const onRenderScale = useCallback((rs: number) => setRenderScale(rs), []);

  return (
    <main className="flex h-screen flex-col bg-slate-50">
      {/* Cabeçalho */}
      <header className="flex items-center gap-4 border-b border-slate-200 bg-white px-4 py-3">
        <h1 className="text-lg font-bold text-slate-800">Quantitativos</h1>
        <div className="flex items-center gap-2">
          <label className="text-sm text-slate-500">Projeto:</label>
          <input
            type="text"
            value={projectName}
            onChange={(e) => setProjectName(e.target.value)}
            className="rounded border border-slate-300 px-2 py-1 text-sm"
          />
        </div>
        <label className="ml-auto cursor-pointer rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700">
          {docId ? "Trocar PDF" : "Abrir PDF"}
          <input
            type="file"
            accept="application/pdf"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleUpload(f);
              e.target.value = "";
            }}
          />
        </label>
      </header>

      {erro && (
        <div className="border-b border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
          {erro}
        </div>
      )}

      {/* Corpo: viewer (esquerda) + painel (direita) */}
      <div className="flex flex-1 overflow-hidden">
        {/* Coluna do viewer */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {arrayBuffer && pages.length > 0 ? (
            <PdfViewer
              fileData={arrayBuffer}
              pages={pages}
              pageIndex={pageIndex}
              scale={scale}
              onPageChange={setPageIndex}
              onRenderScale={onRenderScale}
              canvasRef={canvasRef}
            >
              {/* Overlay de revisão sobreposto ao canvas. */}
              {resultado && canvasRef.current && (
                <ReviewLayerOverlay
                  result={resultado}
                  renderScale={renderScale}
                  pdfHeight={meta?.height ?? 0}
                  canvasWidth={canvasRef.current.width}
                  canvasHeight={canvasRef.current.height}
                />
              )}
            </PdfViewer>
          ) : (
            <div className="flex flex-1 items-center justify-center text-slate-400">
              Abra um arquivo PDF para começar.
            </div>
          )}

          {/* Controle de zoom */}
          {arrayBuffer && (
            <div className="flex items-center gap-2 border-t border-slate-200 bg-white px-3 py-2 text-sm">
              <span className="text-slate-500">Zoom:</span>
              <button
                type="button"
                onClick={() => setScale((s) => Math.max(0.25, s - 0.25))}
                className="rounded border border-slate-300 px-2"
              >
                −
              </button>
              <span className="w-12 text-center">{Math.round(scale * 100)}%</span>
              <button
                type="button"
                onClick={() => setScale((s) => Math.min(4, s + 0.25))}
                className="rounded border border-slate-300 px-2"
              >
                +
              </button>
            </div>
          )}
        </div>

        {/* Painel lateral */}
        <aside className="w-[420px] shrink-0 space-y-4 overflow-auto border-l border-slate-200 bg-slate-50 p-4">
          {docId && meta && (
            <CalibrationTool
              pageIndex={pageIndex}
              renderScale={renderScale}
              canvasEl={canvasRef.current}
              calibration={calibration}
              onCalibrate={setCalibration}
            />
          )}

          {docId && (
            <PremissasPanel premissas={premissas} onChange={setPremissas} />
          )}

          {docId && (
            <div className="space-y-2">
              <button
                type="button"
                onClick={handleExtract}
                disabled={!calibration || ocupado}
                className="w-full rounded bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-40"
                title={!calibration ? "Calibre a escala antes de extrair." : undefined}
              >
                Extrair quantitativos
              </button>
              {!calibration && (
                <p className="text-xs text-amber-600">
                  Calibre a escala da página antes de extrair.
                </p>
              )}
            </div>
          )}

          {resultado && (
            <>
              <ReviewLayer
                result={resultado}
                onChange={setResultado}
                renderScale={renderScale}
                pdfHeight={meta?.height ?? 0}
                canvasWidth={0}
                canvasHeight={0}
              />
              <button
                type="button"
                onClick={handleExport}
                disabled={ocupado}
                className="w-full rounded bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-40"
              >
                Baixar planilha
              </button>
            </>
          )}
        </aside>
      </div>
    </main>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Overlay de revisão desenhado sobre o canvas (pontos de ambientes e contagens).
// As tabelas editáveis ficam no painel lateral via ReviewLayer; aqui só o desenho.
// ─────────────────────────────────────────────────────────────────────────────

function ReviewLayerOverlay({
  result,
  renderScale,
  pdfHeight,
  canvasWidth,
  canvasHeight,
}: {
  result: ExtractionResult;
  renderScale: number;
  pdfHeight: number;
  canvasWidth: number;
  canvasHeight: number;
}) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const cv = ref.current;
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

    ctx.fillStyle = "rgba(37, 99, 235, 0.85)";
    ctx.font = "11px sans-serif";
    for (const r of result.rooms) {
      if (!r.textPos) continue;
      const [px, py] = toPx(r.textPos.x, r.textPos.y);
      ctx.beginPath();
      ctx.arc(px, py, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillText(r.label || r.id, px + 7, py + 3);
    }

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

  return (
    <canvas
      ref={ref}
      className="pointer-events-none absolute left-0 top-0"
    />
  );
}
