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

// Regex de área: captura número + unidade. Aceita imperial (SF / sq ft) e
// métrico (m² / m2). Grupo 1 = número; grupo 2 = unidade.
const AREA_RE = /(\d[\d.,]*)\s*(sf|sq\.?\s?ft|m²|m2)\b/i;
const SF_TO_M2 = 0.09290304; // 1 pé² em m²

/** Comprimento mínimo (m) para um traço ser considerado candidato a parede. */
const WALL_MIN_LENGTH_M = 0.3;

/** Converte um número textual métrico (vírgula ou ponto decimal) em number. */
function toNumMetric(s: string): number {
  const t = s.trim();
  if (t.includes(",") && t.includes(".")) {
    // o separador mais à direita é o decimal
    return t.lastIndexOf(",") > t.lastIndexOf(".")
      ? parseFloat(t.replace(/\./g, "").replace(",", "."))
      : parseFloat(t.replace(/,/g, ""));
  }
  if (t.includes(",")) return parseFloat(t.replace(",", "."));
  return parseFloat(t);
}

/** Converte um rótulo de área (valor + unidade) para m². */
function areaToM2(valRaw: string, unit: string): number {
  const u = unit.toLowerCase();
  if (u.startsWith("m")) return toNumMetric(valRaw); // já em m²
  // imperial: vírgula é separador de milhar
  const v = parseFloat(valRaw.replace(/[,\s]/g, ""));
  return v * SF_TO_M2;
}

/** Um texto é um bom nome de ambiente? (tem letras e não é cota/unidade/área) */
function isRoomName(text: string): boolean {
  const t = text.trim();
  if (t.length < 2) return false;
  if (!/[A-Za-zÀ-ÿ]{2,}/.test(t)) return false; // precisa de letras
  if (AREA_RE.test(t)) return false; // é rótulo de área
  if (/['"]/.test(t)) return false; // cota em pés/polegadas
  if (/^\d/.test(t)) return false; // começa com número (códigos/cotas)
  return true;
}

/**
 * Acha o nome do ambiente associado a um rótulo de área.
 * Em tabelas de área (o caso comum), o nome está na MESMA LINHA, à esquerda do
 * valor. Por isso priorizamos candidatos com y próximo e x menor, escolhendo o
 * mais à esquerda (início da linha = nome do ambiente). Se não houver nada na
 * linha, cai para o nome mais próximo por distância.
 */
function nearestName(areaItem: TextItem, texts: TextItem[]): string | null {
  const rowTol = Math.max(8, (areaItem.height || 0) * 0.8);
  const cands = texts.filter((t) => t !== areaItem && isRoomName(t.text));

  // mesma linha, à esquerda do valor
  const sameRow = cands.filter(
    (t) => Math.abs(t.y - areaItem.y) <= rowTol && t.x < areaItem.x,
  );
  if (sameRow.length > 0) {
    sameRow.sort((a, b) => a.x - b.x); // mais à esquerda = nome do ambiente
    return sameRow[0].text.trim();
  }

  // fallback: mais próximo por distância euclidiana
  const origin: Point = { x: areaItem.x, y: areaItem.y };
  let best: TextItem | null = null;
  let bestDist = Infinity;
  for (const t of cands) {
    const d = dist(origin, { x: t.x, y: t.y });
    if (d < bestDist) {
      bestDist = d;
      best = t;
    }
  }
  return best ? best.text.trim() : null;
}

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
 * Áreas: rótulos SF (convertidos para m²) ou m². Paredes: estimativa pelo
 * "estilo" (cor+espessura) dominante entre os traços longos.
 */
export function quantifyAuto(input: {
  texts: TextItem[];
  segments: Segment[];
  meta: PageMeta;
  metersPerUnit: number;
}): ExtractionResult {
  const { texts: rawTexts, segments: rawSegments, meta, metersPerUnit } = input;
  const calibration: Calibration = { pageIndex: meta.index, metersPerUnit };

  // Muitos PDFs desenham texto/linhas em duplicata (sombra/realce). Deduplica
  // por conteúdo+posição para não dobrar áreas e comprimentos.
  const tSeen = new Set<string>();
  const texts = rawTexts.filter((t) => {
    const k = `${t.text}|${Math.round(t.x)}|${Math.round(t.y)}`;
    if (tSeen.has(k)) return false;
    tSeen.add(k);
    return true;
  });
  const sSeen = new Set<string>();
  const segments = rawSegments.filter((s) => {
    const k = `${Math.round(s.x1)}|${Math.round(s.y1)}|${Math.round(s.x2)}|${Math.round(s.y2)}|${s.color}|${Math.round(s.width * 10)}`;
    if (sSeen.has(k)) return false;
    sSeen.add(k);
    return true;
  });

  // ----- ÁREAS -----
  const rooms: RoomArea[] = [];
  texts.forEach((item) => {
    const m = AREA_RE.exec(item.text);
    if (!m) return;
    const areaM2 = areaToM2(m[1] ?? "", m[2] ?? "");
    if (!Number.isFinite(areaM2) || areaM2 <= 0) return;
    const index = rooms.length;
    rooms.push({
      id: `room-${index}`,
      label: nearestName(item, texts) ?? `Ambiente ${index + 1}`,
      areaM2,
      source: "label",
      textPos: { x: item.x, y: item.y },
    });
  });

  // Remove áreas idênticas repetidas na mesma página (tabelas/legendas
  // duplicadas no sheet). Mantém a 1ª ocorrência de cada valor.
  const aSeen = new Set<string>();
  const dedupRooms: RoomArea[] = [];
  for (const r of rooms) {
    const k = String(Math.round(r.areaM2 * 100));
    if (aSeen.has(k)) continue;
    aSeen.add(k);
    dedupRooms.push({ ...r, id: `room-${dedupRooms.length}` });
  }
  rooms.length = 0;
  rooms.push(...dedupRooms);

  // NOTA: a detecção por geometria (lib/rooms.ts) foi testada e produz
  // resultados não confiáveis em plantas reais (faces sobrepostas por paredes
  // duplas/vãos de porta). Mantida desabilitada até termos um método melhor.

  // ----- PAREDES (estimativa pelo estilo dominante) -----
  // Agrupa traços longos por (cor|espessura) e escolhe o grupo de maior
  // comprimento total — heurística para isolar as linhas de parede do resto.
  const buckets = new Map<string, { len: number; segs: Segment[] }>();
  for (const s of segments) {
    const len = toMeters(segmentLengthUnits(s), calibration);
    if (len < WALL_MIN_LENGTH_M) continue;
    const key = `${s.color}|${Math.round(s.width * 10) / 10}`;
    const b = buckets.get(key) ?? { len: 0, segs: [] };
    b.len += len;
    b.segs.push(s);
    buckets.set(key, b);
  }
  let best: { len: number; segs: Segment[] } | null = null;
  for (const b of buckets.values()) {
    if (!best || b.len > best.len) best = b;
  }
  const walls: WallResult = {
    totalLengthM: best?.len ?? 0,
    segments: best?.segs ?? [],
  };

  return { pageIndex: meta.index, rooms, walls, counts: [], finishes: [] };
}
