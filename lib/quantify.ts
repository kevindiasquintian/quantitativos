import type {
  TextItem,
  Segment,
  PageMeta,
  Calibration,
  RoomArea,
  WallResult,
  CountResult,
  FinishResult,
  ExtractionResult,
  Point,
} from "@/lib/types";
import type { Premissas } from "@/lib/premissas";
import {
  segmentLengthUnits,
  toMeters,
  // polygonAreaM2, // usado na reconstrucao por poligono (fora do MVP, ver comentario abaixo)
} from "@/lib/geometry";

/**
 * Entrada da quantificacao de uma pagina.
 */
interface QuantifyInput {
  texts: TextItem[];
  segments: Segment[];
  meta: PageMeta;
  calibration: Calibration;
  premissas: Premissas;
}

/**
 * Distancia euclidiana entre dois pontos (em unidades de PDF).
 */
function dist(a: Point, b: Point): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Heuristica simples para nomear um ambiente: procura o TextItem nao-numerico
 * mais proximo (acima ou ao lado) do texto que carrega a area.
 */
function nearestRoomLabel(
  areaItem: TextItem,
  texts: TextItem[],
  areaRegex: RegExp,
): string | null {
  const origin: Point = { x: areaItem.x, y: areaItem.y };
  let best: TextItem | null = null;
  let bestDist = Infinity;

  for (const t of texts) {
    if (t === areaItem) continue;
    // Ignora textos que tambem sao anotacoes de area ou puramente numericos.
    if (areaRegex.test(t.text)) continue;
    const trimmed = t.text.trim();
    if (trimmed.length === 0) continue;
    if (/^[\d.,\s]+$/.test(trimmed)) continue;

    const d = dist(origin, { x: t.x, y: t.y });
    if (d < bestDist) {
      bestDist = d;
      best = t;
    }
  }

  return best ? best.text.trim() : null;
}

/**
 * Compara duas cores hex de forma case-insensitive, tolerando ausencia de "#".
 */
function colorMatches(segColor: string, allowed: string[]): boolean {
  if (allowed.length === 0) return true;
  const norm = (c: string) => c.replace(/^#/, "").toLowerCase();
  const target = norm(segColor);
  return allowed.some((c) => norm(c) === target);
}

/**
 * Quantifica uma pagina: areas (rooms), comprimento de paredes (walls),
 * contagens por texto (counts) e areas de acabamento (finishes).
 */
export function quantify(input: QuantifyInput): ExtractionResult {
  const { texts, segments, meta, calibration, premissas } = input;

  // ----- ROOMS (areas anotadas) -----
  const areaRegex = new RegExp(premissas.areaLabelRegex);
  const rooms: RoomArea[] = [];

  texts.forEach((item) => {
    const m = areaRegex.exec(item.text);
    if (!m) return;

    // Grupo 1 traz o valor numerico; normaliza virgula decimal -> ponto.
    const raw = (m[1] ?? "").replace(/\./g, "").replace(",", ".");
    const areaM2 = parseFloat(raw);
    if (!Number.isFinite(areaM2)) return;

    const index = rooms.length;
    const label =
      nearestRoomLabel(item, texts, areaRegex) ?? `Ambiente ${index + 1}`;

    rooms.push({
      id: `room-${index}`,
      label,
      // A area anotada ja vem em m2 no desenho: NAO multiplicar pela escala.
      areaM2,
      source: "label",
      textPos: { x: item.x, y: item.y },
    });

    // Reconstrucao por poligono (fora do MVP): se quisermos derivar a area da
    // geometria, usariamos findClosedPolygons(segments) e, para cada poligono,
    // polygonAreaM2(poligono, calibration), gerando RoomArea com source:"polygon".
  });

  // ----- WALLS (paredes) -----
  const { colors, minWidth, maxWidth } = premissas.wallFilter;
  const wallSegments: Segment[] = segments.filter((s) => {
    if (!colorMatches(s.color, colors)) return false;
    if (s.width < minWidth) return false;
    if (maxWidth !== null && s.width > maxWidth) return false;
    return true;
  });

  const totalLengthM = wallSegments.reduce(
    (acc, s) => acc + toMeters(segmentLengthUnits(s), calibration),
    0,
  );

  const walls: WallResult = {
    totalLengthM,
    segments: wallSegments,
  };

  // ----- COUNTS (contagem por texto) -----
  const counts: CountResult[] = premissas.textCounts.map((tc) => {
    const re = new RegExp(tc.pattern);
    const positions: Point[] = [];
    texts.forEach((t) => {
      if (re.test(t.text)) {
        positions.push({ x: t.x, y: t.y });
      }
    });
    return {
      name: tc.name,
      count: positions.length,
      positions,
    };
  });

  // Contagem por simbolos/assinatura: stub retornando 0. Depende de clustering
  // de segmentos no cliente (symbolSignature/matchSymbol) e fica fora do MVP.
  premissas.symbols.forEach((sym) => {
    counts.push({ name: sym.name, count: 0, positions: [] });
  });

  // ----- FINISHES (acabamentos) -----
  const finishes: FinishResult[] = premissas.finishes.map((f) => {
    const baseAreaM2 = rooms
      .filter(
        (r) => f.roomLabels.length === 0 || f.roomLabels.includes(r.label),
      )
      .reduce((acc, r) => acc + r.areaM2, 0);

    return {
      name: f.name,
      baseAreaM2,
      lossPct: f.lossPct,
      totalAreaM2: baseAreaM2 * (1 + f.lossPct),
    };
  });

  return {
    pageIndex: meta.index,
    rooms,
    walls,
    counts,
    finishes,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Modo AUTOMÁTICO
// O usuário informa apenas a escala. A partir dela calculamos metros por unidade
// de PDF e quantificamos cada página sem premissas configuráveis:
//   • áreas: lidas dos rótulos anotados no desenho (ex.: "Quarto 12,5 m²")
//   • paredes: ESTIMATIVA = soma dos traços do desenho, descartando trechos muito
//     curtos (hachuras/texto) para reduzir ruído. É aproximada por natureza.
// ─────────────────────────────────────────────────────────────────────────────

/** Regex padrão para capturar a área anotada (grupo 1 = número, com , ou .). */
const DEFAULT_AREA_REGEX = /(\d+(?:[.,]\d+)?)\s*m(?:²|2)?\b/i;

/** Comprimento mínimo (em metros) para um traço entrar na estimativa de parede. */
const WALL_MIN_LENGTH_M = 0.3;

/**
 * Converte uma escala 1:N em metros por unidade de PDF.
 * 1 unidade de PDF = 1 ponto = 1/72 polegada no papel; em 1:N isso vira
 * (1/72) * N polegadas reais = N * 0,0254/72 metros reais.
 */
export function scaleToMetersPerUnit(scaleDenominator: number): number {
  return (scaleDenominator * 0.0254) / 72;
}

/**
 * Quantifica uma página em modo automático, recebendo apenas a escala.
 */
export function quantifyAuto(input: {
  texts: TextItem[];
  segments: Segment[];
  meta: PageMeta;
  metersPerUnit: number;
}): ExtractionResult {
  const { texts, segments, meta, metersPerUnit } = input;
  const calibration: Calibration = { pageIndex: meta.index, metersPerUnit };

  // ----- ÁREAS (rótulos anotados) -----
  const rooms: RoomArea[] = [];
  texts.forEach((item) => {
    const m = DEFAULT_AREA_REGEX.exec(item.text);
    if (!m) return;
    const raw = (m[1] ?? "").replace(",", ".");
    const areaM2 = parseFloat(raw);
    if (!Number.isFinite(areaM2) || areaM2 <= 0) return;

    const index = rooms.length;
    const label =
      nearestRoomLabel(item, texts, DEFAULT_AREA_REGEX) ??
      `Ambiente ${index + 1}`;
    rooms.push({
      id: `room-${index}`,
      label,
      areaM2,
      source: "label",
      textPos: { x: item.x, y: item.y },
    });
  });

  // ----- PAREDES (estimativa) -----
  const wallSegments = segments.filter(
    (s) => toMeters(segmentLengthUnits(s), calibration) >= WALL_MIN_LENGTH_M,
  );
  const totalLengthM = wallSegments.reduce(
    (acc, s) => acc + toMeters(segmentLengthUnits(s), calibration),
    0,
  );
  const walls: WallResult = { totalLengthM, segments: wallSegments };

  return {
    pageIndex: meta.index,
    rooms,
    walls,
    counts: [],
    finishes: [],
  };
}
