// ─────────────────────────────────────────────────────────────────────────────
// Detecção de ambientes por GEOMETRIA (reconstrução de polígonos).
// Quando a página não tem áreas anotadas, reconstruímos os recintos fechados a
// partir das linhas de parede:
//   1) seleciona o "estilo" de linha dominante (cor+espessura) como paredes
//   2) calcula interseções e quebra os segmentos (arranjo planar)
//   3) extrai as faces fechadas (DCEL simplificado por menor giro horário)
//   4) descarta a face externa e as fatias finas (vão entre linhas duplas)
//   5) casa cada face a um rótulo de ambiente (point-in-polygon); sem rótulo → "Ambiente N"
//
// É aproximado: vãos de porta podem unir ambientes; mobiliário pode gerar faces
// espúrias (mitigado pelo filtro de área mínima).
// ─────────────────────────────────────────────────────────────────────────────

import type { Segment, TextItem, RoomArea, PageMeta, Point } from "@/lib/types";

const SNAP = 1.5; // tolerância (un. PDF) para unir pontos próximos
const EPS = 1e-6;

function key(x: number, y: number): string {
  return `${Math.round(x / SNAP)}|${Math.round(y / SNAP)}`;
}

interface V {
  x: number;
  y: number;
}

// Interseção de dois segmentos (retorna ponto interior, se houver). T-junções
// e cruzamentos contam; compartilhamento exato de extremidade é ignorado.
function intersect(a: Segment, b: Segment): Point | null {
  const r1x = a.x2 - a.x1,
    r1y = a.y2 - a.y1;
  const r2x = b.x2 - b.x1,
    r2y = b.y2 - b.y1;
  const den = r1x * r2y - r1y * r2x;
  if (Math.abs(den) < EPS) return null; // paralelos/colineares
  const t = ((b.x1 - a.x1) * r2y - (b.y1 - a.y1) * r2x) / den;
  const u = ((b.x1 - a.x1) * r1y - (b.y1 - a.y1) * r1x) / den;
  if (t < -EPS || t > 1 + EPS || u < -EPS || u > 1 + EPS) return null;
  return { x: a.x1 + t * r1x, y: a.y1 + t * r1y };
}

/** Seleciona os segmentos do estilo (cor+espessura) de maior comprimento total. */
function dominantStyle(segments: Segment[]): Segment[] {
  const buckets = new Map<string, { len: number; segs: Segment[] }>();
  for (const s of segments) {
    const len = Math.hypot(s.x2 - s.x1, s.y2 - s.y1);
    if (len < SNAP) continue;
    const k = `${s.color}|${Math.round(s.width * 10) / 10}`;
    const b = buckets.get(k) ?? { len: 0, segs: [] };
    b.len += len;
    b.segs.push(s);
    buckets.set(k, b);
  }
  let best: { len: number; segs: Segment[] } | null = null;
  for (const b of buckets.values()) if (!best || b.len > best.len) best = b;
  return best?.segs ?? [];
}

/** Quebra os segmentos em arestas nos pontos de interseção. */
function planarEdges(segs: Segment[]): Array<[string, string]> {
  // pontos extras (interseções) por segmento
  const extra: Point[][] = segs.map(() => []);
  for (let i = 0; i < segs.length; i++) {
    for (let j = i + 1; j < segs.length; j++) {
      const p = intersect(segs[i], segs[j]);
      if (p) {
        extra[i].push(p);
        extra[j].push(p);
      }
    }
  }
  const edges: Array<[string, string]> = [];
  for (let i = 0; i < segs.length; i++) {
    const s = segs[i];
    const pts: Point[] = [
      { x: s.x1, y: s.y1 },
      { x: s.x2, y: s.y2 },
      ...extra[i],
    ];
    const dx = s.x2 - s.x1,
      dy = s.y2 - s.y1;
    const len2 = dx * dx + dy * dy || 1;
    // ordena ao longo do segmento
    pts.sort(
      (p, q) =>
        ((p.x - s.x1) * dx + (p.y - s.y1) * dy) / len2 -
        ((q.x - s.x1) * dx + (q.y - s.y1) * dy) / len2,
    );
    for (let k = 0; k < pts.length - 1; k++) {
      const ka = key(pts[k].x, pts[k].y);
      const kb = key(pts[k + 1].x, pts[k + 1].y);
      if (ka !== kb) edges.push([ka, kb]);
    }
  }
  return edges;
}

/** Extrai faces fechadas do grafo planar (menor giro horário). */
function extractFaces(
  edges: Array<[string, string]>,
  coord: Map<string, V>,
): string[][] {
  // adjacência: para cada vértice, half-edges de saída ordenadas por ângulo
  const adj = new Map<string, Array<{ to: string; ang: number }>>();
  const add = (a: string, b: string) => {
    const va = coord.get(a)!,
      vb = coord.get(b)!;
    const ang = Math.atan2(vb.y - va.y, vb.x - va.x);
    const list = adj.get(a) ?? [];
    if (!list.some((e) => e.to === b)) list.push({ to: b, ang });
    adj.set(a, list);
  };
  for (const [a, b] of edges) {
    add(a, b);
    add(b, a);
  }
  for (const list of adj.values()) list.sort((p, q) => p.ang - q.ang);

  const visited = new Set<string>(); // "from->to"
  const faces: string[][] = [];
  for (const [a, b] of edges) {
    for (const [u0, v0] of [
      [a, b],
      [b, a],
    ] as Array<[string, string]>) {
      if (visited.has(`${u0}->${v0}`)) continue;
      const face: string[] = [];
      let u = u0,
        v = v0;
      let guard = 0;
      while (guard++ < 10000) {
        visited.add(`${u}->${v}`);
        face.push(u);
        // próximo: em v, a aresta imediatamente no sentido horário a partir de (v->u)
        const list = adj.get(v);
        if (!list || list.length === 0) break;
        const back = Math.atan2(
          coord.get(u)!.y - coord.get(v)!.y,
          coord.get(u)!.x - coord.get(v)!.x,
        );
        // escolhe a maior ângulo < back; se nenhum, o de maior ângulo (wrap)
        let chosen = list[0];
        let bestDelta = Infinity;
        for (const e of list) {
          let d = back - e.ang;
          if (d <= EPS) d += Math.PI * 2;
          if (d < bestDelta) {
            bestDelta = d;
            chosen = e;
          }
        }
        const nu = v,
          nv = chosen.to;
        u = nu;
        v = nv;
        if (u === u0 && v === v0) break;
      }
      if (face.length >= 3) faces.push(face);
    }
  }
  return faces;
}

function signedArea(poly: V[]): number {
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i],
      q = poly[(i + 1) % poly.length];
    a += p.x * q.y - q.x * p.y;
  }
  return a / 2;
}

function centroid(poly: V[]): Point {
  let cx = 0,
    cy = 0;
  for (const p of poly) {
    cx += p.x;
    cy += p.y;
  }
  return { x: cx / poly.length, y: cy / poly.length };
}

function pointInPoly(pt: Point, poly: V[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x,
      yi = poly[i].y,
      xj = poly[j].x,
      yj = poly[j].y;
    const hit =
      yi > pt.y !== yj > pt.y &&
      pt.x < ((xj - xi) * (pt.y - yi)) / (yj - yi + EPS) + xi;
    if (hit) inside = !inside;
  }
  return inside;
}

/** Agrupa textos próximos (nomes multi-linha como "PRIMARY"+"BEDROOM"). */
function clusterLabels(texts: TextItem[]): Array<{ text: string; p: Point }> {
  const cand = texts.filter(
    (t) => /[A-Za-zÀ-ÿ]{2,}/.test(t.text) && !/['"]/.test(t.text) && !/^\d/.test(t.text),
  );
  const used = new Array(cand.length).fill(false);
  const out: Array<{ text: string; p: Point }> = [];
  for (let i = 0; i < cand.length; i++) {
    if (used[i]) continue;
    const group = [cand[i]];
    used[i] = true;
    for (let j = i + 1; j < cand.length; j++) {
      if (used[j]) continue;
      if (
        Math.abs(cand[j].x - cand[i].x) < 60 &&
        Math.abs(cand[j].y - cand[i].y) < 25
      ) {
        group.push(cand[j]);
        used[j] = true;
      }
    }
    group.sort((a, b) => b.y - a.y); // de cima para baixo
    out.push({
      text: group.map((g) => g.text.trim()).join(" "),
      p: { x: group[0].x, y: group[0].y },
    });
  }
  return out;
}

/**
 * Detecta ambientes por geometria e devolve áreas em m².
 */
export function detectRoomsByGeometry(
  segments: Segment[],
  texts: TextItem[],
  metersPerUnit: number,
  meta: PageMeta,
): RoomArea[] {
  const walls = dominantStyle(segments);
  if (walls.length < 3) return [];

  const edges = planarEdges(walls);
  // coordenadas representativas por chave
  const coord = new Map<string, V>();
  for (const s of walls) {
    for (const [x, y] of [
      [s.x1, s.y1],
      [s.x2, s.y2],
    ]) {
      const k = key(x, y);
      if (!coord.has(k)) coord.set(k, { x, y });
    }
  }
  // garante coords de pontos de interseção também
  for (const [a, b] of edges) {
    if (!coord.has(a) || !coord.has(b)) {
      // recupera a partir da própria chave (centro da célula)
      for (const k of [a, b]) {
        if (!coord.has(k)) {
          const [gx, gy] = k.split("|").map(Number);
          coord.set(k, { x: gx * SNAP, y: gy * SNAP });
        }
      }
    }
  }

  const faces = extractFaces(edges, coord);

  // converte faces em polígonos, filtra
  const pageAreaUnits = meta.width * meta.height;
  const m2PerUnit2 = metersPerUnit * metersPerUnit;
  const labels = clusterLabels(texts);
  const usedLabel = new Array(labels.length).fill(false);

  type Face = { poly: V[]; areaU: number; cen: Point };
  const candidates: Face[] = [];
  const seenFaces = new Set<string>();
  for (const f of faces) {
    const poly = f.map((k) => coord.get(k)!).filter(Boolean);
    if (poly.length < 3) continue;
    const areaU = Math.abs(signedArea(poly));
    if (areaU < EPS) continue;
    // descarta face externa (quase a página toda) e fatias minúsculas
    if (areaU > pageAreaUnits * 0.6) continue;
    if (areaU * m2PerUnit2 < 0.5) continue; // < 0,5 m² = ruído/vão de parede
    // dedupe por conjunto de vértices
    const sig = [...new Set(f)].sort().join(",");
    if (seenFaces.has(sig)) continue;
    seenFaces.add(sig);
    candidates.push({ poly, areaU, cen: centroid(poly) });
  }

  // ordena por área desc (ambientes maiores primeiro)
  candidates.sort((a, b) => b.areaU - a.areaU);

  const rooms: RoomArea[] = [];
  candidates.forEach((c, i) => {
    // casa rótulo cujo ponto cai dentro da face
    let label: string | null = null;
    for (let li = 0; li < labels.length; li++) {
      if (usedLabel[li]) continue;
      if (pointInPoly(labels[li].p, c.poly)) {
        label = labels[li].text;
        usedLabel[li] = true;
        break;
      }
    }
    rooms.push({
      id: `room-${i}`,
      label: label ?? `Ambiente ${i + 1}`,
      areaM2: c.areaU * m2PerUnit2,
      source: "polygon",
      polygon: c.poly.map((p) => ({ x: p.x, y: p.y })),
      textPos: c.cen,
    });
  });

  return rooms;
}
