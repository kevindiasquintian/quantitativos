// ─────────────────────────────────────────────────────────────────────────────
// Renderização de PDF no navegador usando pdfjs-dist.
// Mantém um cache simples (por instância de módulo) do documento carregado para
// evitar recarregar o mesmo ArrayBuffer ao navegar entre páginas.
// ─────────────────────────────────────────────────────────────────────────────

import * as pdfjsLib from "pdfjs-dist";
import type { PDFDocumentProxy } from "pdfjs-dist";

// Configura o worker do pdf.js. Importar o `.mjs` via `new URL(..., import.meta.url)`
// como `workerSrc` faz o webpack do Next tentar tratá-lo como ESM external e falhar
// no build (import-esm-externals). Em vez disso, instanciamos o worker com
// `new Worker(new URL(...))`, padrão que o webpack reconhece nativamente e empacota
// como chunk separado, e o entregamos ao pdf.js via `workerPort`.
if (typeof window !== "undefined") {
  pdfjsLib.GlobalWorkerOptions.workerPort = new Worker(
    new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url),
    { type: "module" },
  );
}

// Cache de documentos carregados, indexado por uma chave derivada dos bytes.
// Como cada upload gera um novo ArrayBuffer, usamos a própria referência via Map
// com WeakMap quando possível; aqui mantemos um par {key,doc} simples.
let cached: { key: ArrayBuffer | Uint8Array; doc: PDFDocumentProxy } | null = null;

// Render em andamento por canvas. O pdf.js proíbe dois render() simultâneos no
// mesmo canvas; guardamos a tarefa atual para cancelá-la antes de iniciar outra
// (re-renders do React/StrictMode, troca rápida de página/zoom).
const inFlight = new WeakMap<HTMLCanvasElement, { cancel: () => void; promise: Promise<unknown> }>();

/** Copia os bytes para um Uint8Array independente (pdf.js consome/transfere o buffer). */
function toBytes(fileData: ArrayBuffer | Uint8Array): Uint8Array {
  if (fileData instanceof Uint8Array) return new Uint8Array(fileData);
  return new Uint8Array(fileData.slice(0));
}

/** Carrega (ou reaproveita do cache) o documento PDF. */
async function loadDocument(
  fileData: ArrayBuffer | Uint8Array,
): Promise<PDFDocumentProxy> {
  if (cached && cached.key === fileData) {
    return cached.doc;
  }
  // Documento anterior pode ser descartado.
  if (cached) {
    try {
      await cached.doc.destroy();
    } catch {
      // ignora falhas ao destruir documento antigo
    }
    cached = null;
  }
  const doc = await pdfjsLib.getDocument({ data: toBytes(fileData) }).promise;
  cached = { key: fileData, doc };
  return doc;
}

/**
 * Renderiza uma página no canvas fornecido.
 * @param pageIndex índice 0-based.
 * @param scale fator de zoom aplicado sobre a viewport em escala 1.
 * @returns dimensões em unidades PDF e o renderScale (px do canvas por unidade PDF).
 */
export async function renderPageToCanvas(
  fileData: ArrayBuffer | Uint8Array,
  pageIndex: number,
  canvas: HTMLCanvasElement,
  scale: number,
): Promise<{ pdfWidth: number; pdfHeight: number; renderScale: number }> {
  const doc = await loadDocument(fileData);
  const page = await doc.getPage(pageIndex + 1); // pdf.js usa índice 1-based

  // Viewport na escala 1 para obter as dimensões reais em unidades PDF.
  const baseViewport = page.getViewport({ scale: 1 });
  const pdfWidth = baseViewport.width;
  const pdfHeight = baseViewport.height;

  const viewport = page.getViewport({ scale });
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Não foi possível obter o contexto 2D do canvas.");
  }

  // Cancela um render anterior ainda em andamento neste canvas.
  const prev = inFlight.get(canvas);
  if (prev) {
    prev.cancel();
    try {
      await prev.promise;
    } catch {
      // ignora o cancelamento do render anterior
    }
  }

  // Ajusta o tamanho do canvas em pixels ao da viewport renderizada.
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);

  // Limpa antes de desenhar (importante ao trocar de página).
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const task = page.render({ canvasContext: ctx, viewport });
  inFlight.set(canvas, task);
  try {
    await task.promise;
  } catch (e) {
    // Render cancelado (substituído por outro mais recente): não é erro real.
    if (e && typeof e === "object" && (e as { name?: string }).name === "RenderingCancelledException") {
      return { pdfWidth, pdfHeight, renderScale: viewport.scale };
    }
    throw e;
  } finally {
    if (inFlight.get(canvas) === task) inFlight.delete(canvas);
  }

  // renderScale = pixels do canvas por unidade PDF (== scale da viewport).
  return { pdfWidth, pdfHeight, renderScale: viewport.scale };
}
