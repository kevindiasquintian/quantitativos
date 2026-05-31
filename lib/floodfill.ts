"use client";

// ─────────────────────────────────────────────────────────────────────────────
// Quantificação de áreas por FLOOD-FILL (componentes conexos).
// Renderiza a página, marca paredes (pixels escuros) e acha as regiões fechadas
// do espaço interno (4-conexo) que NÃO tocam a borda do sheet (= interior).
// Cada região vira um ambiente; o nome vem do rótulo de texto que cai dentro.
//
// Limitação honesta: vãos de porta abertos conectam ambientes — eles podem se
// fundir numa única região. Quanto mais "fechada" a planta, melhor o resultado.
// ─────────────────────────────────────────────────────────────────────────────

import { renderOffscreen, getPageTextItems } from "@/lib/pdfClient";
import type { ExtractionResult, RoomArea } from "@/lib/types";

const TARGET_WIDTH = 1600; // resolução de análise
const WALL_LUMA = 160; // < isto = pixel de parede/linha/texto
const MIN_ROOM_M2 = 0.5; // descarta fragmentos

interface LabelCluster {
  text: string;
  x: number;
  y: number; // unidades PDF (origem inferior-esquerda)
}

/** Agrupa textos próximos (nomes multi-linha, ex.: "PRIMARY" + "BEDROOM"). */
function clusterNames(
  texts: Array<{ text: string; x: number; y: number; w: number; h: number }>,
): LabelCluster[] {
  const cand = texts.filter(
    (t) =>
      /[A-Za-zÀ-ÿ]{2,}/.test(t.text) &&
      !/['"]/.test(t.text) &&
      !/^\d/.test(t.text.trim()),
  );
  const used = new Array(cand.length).fill(false);
  const out: LabelCluster[] = [];
  for (let i = 0; i < cand.length; i++) {
    if (used[i]) continue;
    const g = [cand[i]];
    used[i] = true;
    for (let j = i + 1; j < cand.length; j++) {
      if (used[j]) continue;
      if (Math.abs(cand[j].x - cand[i].x) < 80 && Math.abs(cand[j].y - cand[i].y) < 25) {
        g.push(cand[j]);
        used[j] = true;
      }
    }
    g.sort((a, b) => b.y - a.y);
    const cx = g.reduce((s, o) => s + o.x, 0) / g.length;
    const cy = g.reduce((s, o) => s + o.y, 0) / g.length;
    out.push({ text: g.map((o) => o.text.trim()).join(" "), x: cx, y: cy });
  }
  return out;
}

/**
 * Quantifica as áreas de uma página por flood-fill.
 */
export async function quantifyByFloodFill(
  fileData: ArrayBuffer | Uint8Array,
  pageIndex: number,
  metersPerUnit: number,
): Promise<ExtractionResult> {
  const { img, scale, pdfHeight } = await renderOffscreen(
    fileData,
    pageIndex,
    TARGET_WIDTH,
  );
  const { width: W, height: H, data } = img;

  // Máscara de parede (pixel escuro). wall=1 bloqueia o preenchimento.
  const wall = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) {
    const r = data[i * 4],
      g = data[i * 4 + 1],
      b = data[i * 4 + 2];
    const luma = r * 0.299 + g * 0.587 + b * 0.114;
    if (luma < WALL_LUMA) wall[i] = 1;
  }

  // Rotulação de componentes conexos (4-conn) do espaço livre (wall=0).
  const comp = new Int32Array(W * H).fill(-1);
  const compSize: number[] = [];
  const compBorder: boolean[] = [];
  const stack = new Int32Array(W * H);
  let nextId = 0;

  for (let start = 0; start < W * H; start++) {
    if (wall[start] || comp[start] !== -1) continue;
    const id = nextId++;
    let size = 0;
    let touchesBorder = false;
    let sp = 0;
    stack[sp++] = start;
    comp[start] = id;
    while (sp > 0) {
      const idx = stack[--sp];
      size++;
      const x = idx % W;
      const y = (idx / W) | 0;
      if (x === 0 || y === 0 || x === W - 1 || y === H - 1) touchesBorder = true;
      // vizinhos
      if (x > 0) {
        const n = idx - 1;
        if (!wall[n] && comp[n] === -1) {
          comp[n] = id;
          stack[sp++] = n;
        }
      }
      if (x < W - 1) {
        const n = idx + 1;
        if (!wall[n] && comp[n] === -1) {
          comp[n] = id;
          stack[sp++] = n;
        }
      }
      if (y > 0) {
        const n = idx - W;
        if (!wall[n] && comp[n] === -1) {
          comp[n] = id;
          stack[sp++] = n;
        }
      }
      if (y < H - 1) {
        const n = idx + W;
        if (!wall[n] && comp[n] === -1) {
          comp[n] = id;
          stack[sp++] = n;
        }
      }
    }
    compSize[id] = size;
    compBorder[id] = touchesBorder;
  }

  // m² por pixel: 1 px = (1/scale) un. PDF = (metersPerUnit/scale) m.
  const mPerPx = metersPerUnit / scale;
  const m2PerPx = mPerPx * mPerPx;

  // Nomes: converte ponto PDF -> pixel e descobre o componente que o contém.
  const labels = clusterNames(await getPageTextItems(fileData, pageIndex));
  const labelOfComp = new Map<number, string>();
  for (const l of labels) {
    const px = Math.round(l.x * scale);
    const py = Math.round((pdfHeight - l.y) * scale);
    if (px < 0 || py < 0 || px >= W || py >= H) continue;
    // procura um pixel livre perto do rótulo (o texto em si é "parede")
    let found = -1;
    for (let rad = 0; rad <= 12 && found < 0; rad++) {
      for (let dy = -rad; dy <= rad && found < 0; dy++) {
        for (let dx = -rad; dx <= rad && found < 0; dx++) {
          const x = px + dx,
            y = py + dy;
          if (x < 0 || y < 0 || x >= W || y >= H) continue;
          const idx = y * W + x;
          if (!wall[idx] && comp[idx] >= 0) found = comp[idx];
        }
      }
    }
    if (found >= 0 && !labelOfComp.has(found)) labelOfComp.set(found, l.text);
  }

  // Monta os ambientes: componentes internos (não tocam a borda) com área mínima.
  const rooms: RoomArea[] = [];
  for (let id = 0; id < nextId; id++) {
    if (compBorder[id]) continue; // exterior / aberto à borda
    const areaM2 = compSize[id] * m2PerPx;
    if (areaM2 < MIN_ROOM_M2) continue;
    rooms.push({
      id: `ff-${id}`,
      label: labelOfComp.get(id) ?? `Ambiente ${rooms.length + 1}`,
      areaM2,
      source: "polygon",
    });
  }
  rooms.sort((a, b) => b.areaM2 - a.areaM2);

  return {
    pageIndex,
    rooms,
    walls: { totalLengthM: 0, segments: [] },
    counts: [],
    finishes: [],
  };
}
