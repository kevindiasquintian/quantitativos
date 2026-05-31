"use client";

// ─────────────────────────────────────────────────────────────────────────────
// Ferramenta de calibração de escala.
// Fluxo principal (2 cliques): o usuário ativa o modo, clica 2 pontos sobre o
// canvas, informa a distância real em metros, e calculamos:
//   metersPerUnit = metrosReais / distanciaEmUnidadesPdf
// onde distanciaEmUnidadesPdf = distanciaEmPixels / renderScale.
//
// Alternativa (escala 1:N): pré-preenche uma estimativa de metersPerUnit
// assumindo 1 unidade PDF = 1/72 polegada = 0,0254/72 m, escalada por N.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useRef, useState } from "react";
import type { Calibration, Point } from "@/lib/types";

interface CalibrationToolProps {
  pageIndex: number;
  /** px do canvas por unidade PDF (vindo do PdfViewer). */
  renderScale: number;
  /** elemento canvas onde capturar os cliques. */
  canvasEl: HTMLCanvasElement | null;
  calibration: Calibration | null;
  onCalibrate: (cal: Calibration) => void;
}

// Conversão de uma unidade PDF para metros: 1 pt = 1/72 inch; 1 inch = 0,0254 m.
const METROS_POR_UNIDADE_PDF = 0.0254 / 72;

export default function CalibrationTool({
  pageIndex,
  renderScale,
  canvasEl,
  calibration,
  onCalibrate,
}: CalibrationToolProps) {
  const [ativo, setAtivo] = useState(false);
  const [pontos, setPontos] = useState<Point[]>([]);
  const [metrosReais, setMetrosReais] = useState("");
  const [escalaN, setEscalaN] = useState("");
  const [erro, setErro] = useState<string | null>(null);

  // Mantém referência estável ao handler para adicionar/remover o listener.
  const pontosRef = useRef<Point[]>([]);
  pontosRef.current = pontos;

  // Distância em pixels entre os 2 pontos clicados (no espaço do canvas).
  const distPixels =
    pontos.length === 2
      ? Math.hypot(pontos[1].x - pontos[0].x, pontos[1].y - pontos[0].y)
      : 0;
  // Distância correspondente em unidades PDF.
  const distUnidades = renderScale > 0 ? distPixels / renderScale : 0;

  useEffect(() => {
    if (!ativo || !canvasEl) return;

    function handleClick(ev: MouseEvent) {
      const rect = canvasEl!.getBoundingClientRect();
      // Coordenadas em PIXELS relativas ao canvas (corrige eventual escala CSS).
      const escalaX = canvasEl!.width / rect.width;
      const escalaY = canvasEl!.height / rect.height;
      const x = (ev.clientX - rect.left) * escalaX;
      const y = (ev.clientY - rect.top) * escalaY;
      setPontos((prev) => {
        // Recomeça a captura após já ter 2 pontos.
        const base = prev.length >= 2 ? [] : prev;
        return [...base, { x, y }];
      });
    }

    canvasEl.addEventListener("click", handleClick);
    canvasEl.style.cursor = "crosshair";
    return () => {
      canvasEl.removeEventListener("click", handleClick);
      canvasEl.style.cursor = "";
    };
  }, [ativo, canvasEl]);

  function aplicarDoisCliques() {
    setErro(null);
    const metros = parseFloat(metrosReais.replace(",", "."));
    if (pontos.length !== 2) {
      setErro("Clique dois pontos sobre o desenho antes de aplicar.");
      return;
    }
    if (!Number.isFinite(metros) || metros <= 0) {
      setErro("Informe a distância real em metros (> 0).");
      return;
    }
    if (distUnidades <= 0) {
      setErro("Distância nula entre os pontos. Clique novamente.");
      return;
    }
    const metersPerUnit = metros / distUnidades;
    onCalibrate({ pageIndex, metersPerUnit });
    setAtivo(false);
  }

  function aplicarEscalaN() {
    setErro(null);
    const n = parseFloat(escalaN.replace(",", "."));
    if (!Number.isFinite(n) || n <= 0) {
      setErro("Informe um denominador de escala válido (ex.: 50 para 1:50).");
      return;
    }
    // Estimativa: cada unidade PDF (1/72") representa N unidades no mundo real.
    const metersPerUnit = METROS_POR_UNIDADE_PDF * n;
    onCalibrate({ pageIndex, metersPerUnit });
  }

  return (
    <section className="rounded border border-slate-200 bg-white p-3">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-700">Calibração de escala</h2>
        <button
          type="button"
          className={
            "rounded px-3 py-1 text-sm " +
            (ativo
              ? "bg-blue-600 text-white"
              : "border border-slate-300 text-slate-700")
          }
          onClick={() => {
            setAtivo((a) => !a);
            setPontos([]);
            setErro(null);
          }}
        >
          {ativo ? "Cancelar" : "Calibrar escala"}
        </button>
      </div>

      {calibration && (
        <p className="mb-2 text-xs text-emerald-700">
          Fator atual: 1 unidade PDF = {calibration.metersPerUnit.toFixed(6)} m
        </p>
      )}

      {ativo && (
        <div className="mb-3 space-y-2 rounded bg-blue-50 p-2 text-xs text-slate-700">
          <p>
            Cliques: {pontos.length}/2
            {pontos.length === 2 && (
              <>
                {" "}
                — distância: {distUnidades.toFixed(2)} un. PDF (
                {distPixels.toFixed(0)} px)
              </>
            )}
          </p>
          <div className="flex items-center gap-2">
            <label className="whitespace-nowrap">Distância real (m):</label>
            <input
              type="text"
              inputMode="decimal"
              value={metrosReais}
              onChange={(e) => setMetrosReais(e.target.value)}
              placeholder="ex.: 5.00"
              className="w-24 rounded border border-slate-300 px-2 py-1"
            />
            <button
              type="button"
              onClick={aplicarDoisCliques}
              className="rounded bg-emerald-600 px-3 py-1 text-white"
            >
              Aplicar
            </button>
          </div>
        </div>
      )}

      {/* Alternativa: escala 1:N (estimativa de pré-preenchimento). */}
      <div className="flex items-center gap-2 text-xs text-slate-600">
        <label className="whitespace-nowrap">Escala 1:</label>
        <input
          type="text"
          inputMode="numeric"
          value={escalaN}
          onChange={(e) => setEscalaN(e.target.value)}
          placeholder="N (ex.: 50)"
          className="w-20 rounded border border-slate-300 px-2 py-1"
        />
        <button
          type="button"
          onClick={aplicarEscalaN}
          className="rounded border border-slate-300 px-3 py-1"
        >
          Estimar
        </button>
      </div>

      {erro && <p className="mt-2 text-xs text-red-600">{erro}</p>}
    </section>
  );
}
