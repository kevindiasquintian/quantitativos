// ─────────────────────────────────────────────────────────────────────────────
// Contratos de dados compartilhados entre backend (API routes / libs) e frontend.
// Todas as coordenadas geométricas estão no espaço da página PDF (unidades PDF,
// "points", origem no canto inferior-esquerdo conforme o pdf.js as fornece, salvo
// quando explicitamente convertidas para o canvas no frontend).
//
// Pipeline:
//   upload  -> UploadResult (metadados das páginas)
//   extract -> ExtractionResult (candidatos de quantitativos para UMA página)
//   export  -> arquivo .xlsx a partir de ExportPayload (resultados revisados)
// ─────────────────────────────────────────────────────────────────────────────

export interface Point {
  x: number;
  y: number;
}

/** Segmento de reta extraído do conteúdo vetorial do PDF. */
export interface Segment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  /** Cor do traço em hex, ex.: "#000000". "#000000" quando indefinida. */
  color: string;
  /** Espessura do traço em unidades PDF. 0 quando indefinida. */
  width: number;
}

/** Item de texto com posição (origem da baseline) no espaço da página. */
export interface TextItem {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Metadados de uma página retornados após o upload. */
export interface PageMeta {
  /** índice 0-based da página. */
  index: number;
  /** largura em unidades PDF (points). */
  width: number;
  /** altura em unidades PDF (points). */
  height: number;
  /** true se a página possui conteúdo vetorial; false se é raster/escaneada. */
  isVector: boolean;
}

export interface UploadResult {
  docId: string;
  fileName: string;
  pages: PageMeta[];
}

/**
 * Calibração de escala de uma página.
 * Para converter uma distância medida em unidades PDF para metros:
 *   metros = distanciaEmUnidadesPdf * metersPerUnit
 */
export interface Calibration {
  pageIndex: number;
  metersPerUnit: number;
}

// ── Resultados de extração (candidatos, sempre editáveis na revisão) ───────────

export interface RoomArea {
  id: string;
  /** nome do ambiente, se identificado próximo ao rótulo de área. */
  label: string;
  areaM2: number;
  /** origem do dado: rótulo de texto, polígono reconstruído ou inserção manual. */
  source: "label" | "polygon" | "manual";
  /** polígono em coordenadas PDF, quando disponível (para overlay). */
  polygon?: Point[];
  /** posição do texto de origem, quando veio de rótulo (para overlay). */
  textPos?: Point;
}

export interface WallResult {
  /** comprimento linear total de parede, em metros. */
  totalLengthM: number;
  /** segmentos classificados como parede (para overlay e auditoria). */
  segments: Segment[];
}

export interface CountResult {
  /** nome do elemento contado, ex.: "Porta", "Janela". */
  name: string;
  count: number;
  /** posições das ocorrências encontradas (para overlay), quando disponível. */
  positions?: Point[];
}

export interface FinishResult {
  /** nome do piso/revestimento. */
  name: string;
  /** área-base (m²) antes da perda. */
  baseAreaM2: number;
  /** percentual de perda aplicado (0.1 = 10%). */
  lossPct: number;
  /** área total considerando a perda: baseAreaM2 * (1 + lossPct). */
  totalAreaM2: number;
}

/** Resultado de extração para UMA página. */
export interface ExtractionResult {
  pageIndex: number;
  rooms: RoomArea[];
  walls: WallResult;
  counts: CountResult[];
  finishes: FinishResult[];
}

// ── Payloads das rotas de API ─────────────────────────────────────────────────

/** Corpo de POST /api/extract. */
export interface ExtractRequest {
  docId: string;
  pageIndex: number;
  calibration: Calibration;
  /** premissas validadas (ver lib/premissas.ts → Premissas). */
  premissas: import("./premissas").Premissas;
}

/** Corpo de POST /api/export. Resultados já revisados/editados pelo usuário. */
export interface ExportPayload {
  projectName: string;
  premissas: import("./premissas").Premissas;
  /** um ExtractionResult por página considerada. */
  pages: ExtractionResult[];
}
