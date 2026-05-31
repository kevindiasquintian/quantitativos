// Modulo server-only: extracao de metadados, textos e segmentos de PDF.
// Usa o build legacy ESM do pdfjs-dist, com worker desabilitado no servidor.
import "server-only";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import type { PageMeta, Segment, TextItem } from "@/lib/types";

// Operadores do pdf.js (OPS). Tipamos como Record para acesso seguro.
const OPS = (pdfjsLib as any).OPS as Record<string, number>;

// Matriz de transformacao 2D no formato [a, b, c, d, e, f] (igual ao PDF/pdf.js).
type Matrix = [number, number, number, number, number, number];

const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

// Multiplica duas matrizes (m1 aplicada apos m2, isto e: resultado = m1 * m2).
function multiply(m1: Matrix, m2: Matrix): Matrix {
  return [
    m1[0] * m2[0] + m1[2] * m2[1],
    m1[1] * m2[0] + m1[3] * m2[1],
    m1[0] * m2[2] + m1[2] * m2[3],
    m1[1] * m2[2] + m1[3] * m2[3],
    m1[0] * m2[4] + m1[2] * m2[5] + m1[4],
    m1[1] * m2[4] + m1[3] * m2[5] + m1[5],
  ];
}

// Aplica a matriz a um ponto.
function applyMatrix(m: Matrix, x: number, y: number): { x: number; y: number } {
  return {
    x: m[0] * x + m[2] * y + m[4],
    y: m[1] * x + m[3] * y + m[5],
  };
}

// Converte um componente de cor (0..1) para par hexadecimal.
function channel(v: number): string {
  const n = Math.max(0, Math.min(255, Math.round(v * 255)));
  return n.toString(16).padStart(2, "0");
}

// Monta cor hex #rrggbb a partir de componentes 0..1.
function toHex(r: number, g: number, b: number): string {
  return `#${channel(r)}${channel(g)}${channel(b)}`;
}

// Carrega o documento desabilitando o worker (ambiente de servidor).
async function loadDocument(data: Uint8Array) {
  const task = (pdfjsLib as any).getDocument({
    data,
    useWorkerFetch: false,
    isEvalSupported: false,
    disableWorker: true,
  });
  return task.promise;
}

// Conjuntos de operadores classificados como "path" e "imagem".
function pathOpSet(): Set<number> {
  const names = [
    "constructPath",
    "stroke",
    "fill",
    "eoFill",
    "fillStroke",
    "eoFillStroke",
    "closeStroke",
    "closeFillStroke",
    "lineTo",
    "moveTo",
    "curveTo",
    "rectangle",
  ];
  const set = new Set<number>();
  for (const n of names) {
    if (typeof OPS[n] === "number") set.add(OPS[n]);
  }
  return set;
}

function imageOpSet(): Set<number> {
  const names = ["paintImageXObject", "paintInlineImageXObject", "paintImageMaskXObject"];
  const set = new Set<number>();
  for (const n of names) {
    if (typeof OPS[n] === "number") set.add(OPS[n]);
  }
  return set;
}

// Retorna os metadados (dimensoes e se a pagina e vetorial) de todas as paginas.
export async function getPagesMeta(data: Uint8Array): Promise<PageMeta[]> {
  const doc = await loadDocument(data);
  const result: PageMeta[] = [];
  const pathOps = pathOpSet();
  const imageOps = imageOpSet();

  for (let i = 0; i < doc.numPages; i++) {
    try {
      const page = await doc.getPage(i + 1);
      const viewport = page.getViewport({ scale: 1 });

      let pathCount = 0;
      let imageCount = 0;
      try {
        const opList = await page.getOperatorList();
        for (const fn of opList.fnArray as number[]) {
          if (pathOps.has(fn)) pathCount++;
          else if (imageOps.has(fn)) imageCount++;
        }
      } catch {
        // Falha ao obter a lista de operadores: tratamos como nao-vetorial.
      }

      const isVector = pathCount > 0 && pathCount >= imageCount;

      result.push({
        index: i,
        width: viewport.width,
        height: viewport.height,
        isVector,
      });
    } catch {
      // Pagina problematica: registra metadados minimos sem derrubar o lote.
      result.push({ index: i, width: 0, height: 0, isVector: false });
    }
  }

  return result;
}

// Estado grafico rastreado durante a varredura da operatorList.
interface GfxState {
  ctm: Matrix;
  strokeColor: string;
  lineWidth: number;
}

function cloneState(s: GfxState): GfxState {
  return { ctm: [...s.ctm] as Matrix, strokeColor: s.strokeColor, lineWidth: s.lineWidth };
}

// Extrai metadados, textos e segmentos retos de uma pagina especifica.
export async function extractPage(
  data: Uint8Array,
  pageIndex: number,
): Promise<{ meta: PageMeta; texts: TextItem[]; segments: Segment[] }> {
  const doc = await loadDocument(data);
  const page = await doc.getPage(pageIndex + 1);
  const viewport = page.getViewport({ scale: 1 });

  const pathOps = pathOpSet();
  const imageOps = imageOpSet();

  const texts: TextItem[] = [];
  const segments: Segment[] = [];

  // --- Textos ---
  try {
    const content = await page.getTextContent();
    for (const raw of content.items as any[]) {
      if (typeof raw.str !== "string") continue;
      const text = raw.str;
      if (text.trim().length === 0) continue;
      const t = raw.transform as number[]; // [a,b,c,d,e,f]
      const x = t[4];
      const y = t[5];
      texts.push({
        text,
        x,
        y,
        width: typeof raw.width === "number" ? raw.width : 0,
        height: typeof raw.height === "number" ? raw.height : 0,
      });
    }
  } catch {
    // Sem conteudo textual recuperavel: segue apenas com segmentos.
  }

  // --- Segmentos (vetores) ---
  let pathCount = 0;
  let imageCount = 0;

  try {
    const opList = await page.getOperatorList();
    const fnArray = opList.fnArray as number[];
    const argsArray = opList.argsArray as any[];

    // Pilha e estado grafico corrente.
    const stack: GfxState[] = [];
    let state: GfxState = { ctm: [...IDENTITY] as Matrix, strokeColor: "#000000", lineWidth: 1 };

    // Buffer de segmentos do path corrente, ainda nao "pintados".
    // Guardamos pontos ja transformados pela CTM vigente na construcao.
    let pendingStraight: { x1: number; y1: number; x2: number; y2: number }[] = [];

    // Interpreta um array de operacoes de construcao de caminho (constructPath).
    // Formato: ops:number[], args:number[] (coordenadas sequenciais).
    function buildPath(subOps: number[], coords: number[]): void {
      const ctm = state.ctm;
      let ci = 0; // indice em coords
      let cur: { x: number; y: number } | null = null;
      let start: { x: number; y: number } | null = null;

      for (const op of subOps) {
        if (op === OPS.moveTo) {
          const p = applyMatrix(ctm, coords[ci++], coords[ci++]);
          cur = p;
          start = p;
        } else if (op === OPS.lineTo) {
          const p = applyMatrix(ctm, coords[ci++], coords[ci++]);
          if (cur) pendingStraight.push({ x1: cur.x, y1: cur.y, x2: p.x, y2: p.y });
          cur = p;
        } else if (op === OPS.curveTo) {
          // Curva de Bezier cubica: aproximamos pela corda (inicio -> fim).
          ci += 4; // dois pontos de controle ignorados
          const p = applyMatrix(ctm, coords[ci++], coords[ci++]);
          if (cur) pendingStraight.push({ x1: cur.x, y1: cur.y, x2: p.x, y2: p.y });
          cur = p;
        } else if (op === OPS.curveTo2) {
          ci += 2;
          const p = applyMatrix(ctm, coords[ci++], coords[ci++]);
          if (cur) pendingStraight.push({ x1: cur.x, y1: cur.y, x2: p.x, y2: p.y });
          cur = p;
        } else if (op === OPS.curveTo3) {
          ci += 2;
          const p = applyMatrix(ctm, coords[ci++], coords[ci++]);
          if (cur) pendingStraight.push({ x1: cur.x, y1: cur.y, x2: p.x, y2: p.y });
          cur = p;
        } else if (op === OPS.rectangle) {
          // Retangulo (x, y, w, h) aproximado por 4 segmentos.
          const x = coords[ci++];
          const y = coords[ci++];
          const w = coords[ci++];
          const h = coords[ci++];
          const a = applyMatrix(ctm, x, y);
          const b = applyMatrix(ctm, x + w, y);
          const c = applyMatrix(ctm, x + w, y + h);
          const d = applyMatrix(ctm, x, y + h);
          pendingStraight.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y });
          pendingStraight.push({ x1: b.x, y1: b.y, x2: c.x, y2: c.y });
          pendingStraight.push({ x1: c.x, y1: c.y, x2: d.x, y2: d.y });
          pendingStraight.push({ x1: d.x, y1: d.y, x2: a.x, y2: a.y });
          cur = a;
          start = a;
        } else if (op === OPS.closePath) {
          if (cur && start) pendingStraight.push({ x1: cur.x, y1: cur.y, x2: start.x, y2: start.y });
          cur = start;
        }
      }
    }

    // Emite os segmentos pendentes como Segments definitivos (ao haver stroke).
    function flushStroke(): void {
      for (const s of pendingStraight) {
        segments.push({
          x1: s.x1,
          y1: s.y1,
          x2: s.x2,
          y2: s.y2,
          color: state.strokeColor,
          width: state.lineWidth,
        });
      }
    }

    for (let k = 0; k < fnArray.length; k++) {
      const fn = fnArray[k];
      const args = argsArray[k];

      if (pathOps.has(fn)) pathCount++;
      else if (imageOps.has(fn)) imageCount++;

      if (fn === OPS.save) {
        stack.push(cloneState(state));
      } else if (fn === OPS.restore) {
        const prev = stack.pop();
        if (prev) state = prev;
      } else if (fn === OPS.transform) {
        // args = [a,b,c,d,e,f]; concatena na CTM corrente.
        const m: Matrix = [args[0], args[1], args[2], args[3], args[4], args[5]];
        state.ctm = multiply(state.ctm, m);
      } else if (fn === OPS.setLineWidth) {
        state.lineWidth = typeof args[0] === "number" ? args[0] : state.lineWidth;
      } else if (fn === OPS.setStrokeRGBColor) {
        // args = [r,g,b] em 0..255 no pdf.js.
        state.strokeColor = toHex(args[0] / 255, args[1] / 255, args[2] / 255);
      } else if (fn === OPS.setStrokeColor || fn === OPS.setStrokeColorN) {
        // Componentes geralmente em 0..1; usa o que houver disponivel.
        const a = args ?? [];
        if (a.length >= 3) state.strokeColor = toHex(a[0], a[1], a[2]);
        else if (a.length === 1) state.strokeColor = toHex(a[0], a[0], a[0]);
      } else if (fn === OPS.setStrokeGray) {
        const g = typeof args[0] === "number" ? args[0] : 0;
        state.strokeColor = toHex(g, g, g);
      } else if (fn === OPS.constructPath) {
        // args = [opsArray, coordsArray] (com possivel minMax adicional).
        const subOps: number[] = args[0] as number[];
        const coords: number[] = args[1] as number[];
        buildPath(subOps, coords);
      } else if (
        fn === OPS.stroke ||
        fn === OPS.closeStroke ||
        fn === OPS.fillStroke ||
        fn === OPS.eoFillStroke ||
        fn === OPS.closeFillStroke ||
        fn === OPS.closeEOFillStroke
      ) {
        // Ha traco: materializa os segmentos pendentes e zera o buffer.
        flushStroke();
        pendingStraight = [];
      } else if (fn === OPS.fill || fn === OPS.eoFill || fn === OPS.endPath) {
        // Preenchimento/encerramento sem traco: descarta o buffer.
        pendingStraight = [];
      }
    }
  } catch {
    // Falha ao processar vetores: retornamos o que foi coletado ate aqui.
  }

  const isVector = pathCount > 0 && pathCount >= imageCount;

  const meta: PageMeta = {
    index: pageIndex,
    width: viewport.width,
    height: viewport.height,
    isVector,
  };

  return { meta, texts, segments };
}
