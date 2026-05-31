"use client";

// ─────────────────────────────────────────────────────────────────────────────
// Página principal (cliente) — fluxo AUTOMÁTICO e simples:
//   1) abrir o PDF
//   2) informar SOMENTE a escala (1:N)
//   3) um clique lê TODAS as páginas e retorna os quantitativos
//   4) baixar a planilha
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useRef, useState } from "react";
import PdfViewer from "@/components/PdfViewer";
import { defaultPremissas } from "@/lib/premissas";
import type {
  ExtractionResult,
  ExportPayload,
  PageMeta,
  UploadResult,
} from "@/lib/types";

export default function Home() {
  const [projectName, setProjectName] = useState("Projeto");
  const [docId, setDocId] = useState<string | null>(null);
  const [pages, setPages] = useState<PageMeta[]>([]);
  const [arrayBuffer, setArrayBuffer] = useState<ArrayBuffer | null>(null);
  const [pageIndex, setPageIndex] = useState(0);
  const [zoom, setZoom] = useState(1.2);

  // Única entrada do usuário: o denominador da escala (1:N).
  const [scaleDen, setScaleDen] = useState(100);

  const [results, setResults] = useState<ExtractionResult[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const onRenderScale = useCallback(() => {}, []);

  // ── 1) Upload ────────────────────────────────────────────────────────────────
  async function handleUpload(file: File) {
    setErro(null);
    setOcupado(true);
    try {
      const buf = await file.arrayBuffer();
      setArrayBuffer(buf);
      setPageIndex(0);
      setResults(null);

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
      setErro("Falha no upload: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setOcupado(false);
    }
  }

  // ── 2+3) Processar TODAS as páginas (só a escala) ─────────────────────────────
  async function handleProcess() {
    if (!docId) return;
    if (!Number.isFinite(scaleDen) || scaleDen <= 0) {
      setErro("Informe uma escala válida, ex.: 50 para 1:50.");
      return;
    }
    setErro(null);
    setOcupado(true);
    try {
      const resp = await fetch("/api/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ docId, scaleDenominator: scaleDen }),
      });
      if (!resp.ok) {
        const j = await resp.json().catch(() => null);
        throw new Error(j?.error || "Processamento falhou (HTTP " + resp.status + ").");
      }
      const data: { pages: ExtractionResult[] } = await resp.json();
      setResults(data.pages);
    } catch (e) {
      setErro("Falha ao processar: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setOcupado(false);
    }
  }

  // ── 4) Baixar planilha ────────────────────────────────────────────────────────
  async function handleExport() {
    if (!results) return;
    setErro(null);
    setOcupado(true);
    try {
      const payload: ExportPayload = {
        projectName: projectName || "Projeto",
        premissas: defaultPremissas,
        pages: results,
      };
      const resp = await fetch("/api/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!resp.ok) throw new Error("Exportação falhou (HTTP " + resp.status + ").");
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
      setErro("Falha na exportação: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setOcupado(false);
    }
  }

  // Totais agregados de todas as páginas.
  const totalArea = results
    ? results.reduce((a, p) => a + p.rooms.reduce((s, r) => s + r.areaM2, 0), 0)
    : 0;
  const totalWall = results
    ? results.reduce((a, p) => a + p.walls.totalLengthM, 0)
    : 0;
  const totalRooms = results
    ? results.reduce((a, p) => a + p.rooms.length, 0)
    : 0;

  return (
    <main className="flex h-screen flex-col bg-slate-50">
      {/* Cabeçalho */}
      <header className="flex flex-wrap items-center gap-3 border-b border-slate-200 bg-white px-4 py-3">
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

        {/* Escala — a única entrada do usuário */}
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-slate-700">Escala 1 :</label>
          <input
            type="number"
            min={1}
            value={scaleDen}
            onChange={(e) => setScaleDen(Number(e.target.value))}
            className="w-24 rounded border border-slate-300 px-2 py-1 text-sm"
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

        <button
          type="button"
          onClick={handleProcess}
          disabled={!docId || ocupado}
          className="rounded bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-40"
        >
          {ocupado ? "Lendo…" : "Ler todas as páginas"}
        </button>

        <button
          type="button"
          onClick={handleExport}
          disabled={!results || ocupado}
          className="rounded border border-blue-600 px-3 py-1.5 text-sm font-medium text-blue-700 hover:bg-blue-50 disabled:opacity-40"
        >
          Baixar planilha
        </button>
      </header>

      {erro && (
        <div className="border-b border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
          {erro}
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        {/* Pré-visualização do PDF (apenas visual) */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {arrayBuffer && pages.length > 0 ? (
            <>
              <PdfViewer
                fileData={arrayBuffer}
                pages={pages}
                pageIndex={pageIndex}
                scale={zoom}
                onPageChange={setPageIndex}
                onRenderScale={onRenderScale}
                canvasRef={canvasRef}
              />
              <div className="flex items-center gap-2 border-t border-slate-200 bg-white px-3 py-2 text-sm">
                <span className="text-slate-500">Zoom:</span>
                <button
                  type="button"
                  onClick={() => setZoom((s) => Math.max(0.25, s - 0.25))}
                  className="rounded border border-slate-300 px-2"
                >
                  −
                </button>
                <span className="w-12 text-center">{Math.round(zoom * 100)}%</span>
                <button
                  type="button"
                  onClick={() => setZoom((s) => Math.min(4, s + 0.25))}
                  className="rounded border border-slate-300 px-2"
                >
                  +
                </button>
              </div>
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center px-6 text-center text-slate-400">
              Abra um PDF, informe a escala e clique em “Ler todas as páginas”.
            </div>
          )}
        </div>

        {/* Resultados */}
        <aside className="w-[460px] shrink-0 overflow-auto border-l border-slate-200 bg-white p-4">
          {!results && (
            <p className="text-sm text-slate-500">
              Os quantitativos aparecem aqui depois de ler o PDF.
            </p>
          )}

          {results && (
            <div className="space-y-5">
              {/* Resumo geral */}
              <section>
                <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-500">
                  Resumo
                </h2>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <Card label="Ambientes" value={String(totalRooms)} />
                  <Card label="Área total" value={`${totalArea.toFixed(2)} m²`} />
                  <Card label="Paredes (est.)" value={`${totalWall.toFixed(2)} m`} />
                </div>
                <p className="mt-2 text-xs text-slate-400">
                  Áreas lidas dos rótulos do desenho. Paredes são estimativa a partir
                  das linhas, na escala 1:{scaleDen}.
                </p>
              </section>

              {/* Detalhe por página */}
              {results.map((p) => {
                const areaPg = p.rooms.reduce((s, r) => s + r.areaM2, 0);
                return (
                  <section key={p.pageIndex}>
                    <h3 className="mb-1 text-sm font-semibold text-slate-700">
                      Página {p.pageIndex + 1}
                      <span className="ml-2 font-normal text-slate-400">
                        {areaPg.toFixed(2)} m² · {p.walls.totalLengthM.toFixed(2)} m de parede
                      </span>
                    </h3>
                    {p.rooms.length === 0 ? (
                      <p className="text-xs text-slate-400">
                        Nenhuma área anotada encontrada nesta página.
                      </p>
                    ) : (
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-left text-slate-500">
                            <th className="py-1">Ambiente</th>
                            <th className="py-1 text-right">Área (m²)</th>
                          </tr>
                        </thead>
                        <tbody>
                          {p.rooms.map((r) => (
                            <tr key={r.id} className="border-t border-slate-100">
                              <td className="py-1">{r.label}</td>
                              <td className="py-1 text-right">{r.areaM2.toFixed(2)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </section>
                );
              })}
            </div>
          )}
        </aside>
      </div>
    </main>
  );
}

function Card({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-slate-200 bg-slate-50 px-2 py-3">
      <div className="text-lg font-bold text-slate-800">{value}</div>
      <div className="text-xs text-slate-500">{label}</div>
    </div>
  );
}
