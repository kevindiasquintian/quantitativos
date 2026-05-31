// Modulo de geometria puro e isomorfico (sem dependencias externas).
// Funcoes deterministas usadas para quantificacao a partir de segmentos do PDF.

import type { Point, Segment, Calibration } from "@/lib/types";

// Tolerancia de "snap" para considerar dois pontos coincidentes (em unidades do PDF).
const SNAP_TOL = 1e-3;

// Comprimento da hipotenusa entre (x1,y1) e (x2,y2), em unidades do PDF.
export function segmentLengthUnits(s: Segment): number {
  const dx = s.x2 - s.x1;
  const dy = s.y2 - s.y1;
  return Math.hypot(dx, dy);
}

// Converte unidades do PDF para metros usando a calibracao.
export function toMeters(units: number, cal: Calibration): number {
  return units * cal.metersPerUnit;
}

// Area de poligono via formula do cadarco (shoelace). Retorna valor ABSOLUTO,
// independente da orientacao (horaria/anti-horaria) dos vertices.
export function polygonAreaUnits(points: Point[]): number {
  const n = points.length;
  if (n < 3) return 0;
  let acc = 0;
  for (let i = 0; i < n; i++) {
    const a = points[i];
    const b = points[(i + 1) % n];
    acc += a.x * b.y - b.x * a.y;
  }
  return Math.abs(acc) / 2;
}

// Area em metros quadrados: area em unidades multiplicada pelo fator linear ao quadrado.
export function polygonAreaM2(points: Point[], cal: Calibration): number {
  return polygonAreaUnits(points) * cal.metersPerUnit * cal.metersPerUnit;
}

// ----------------------------------------------------------------------------
// Deteccao de poligonos fechados a partir de segmentos soltos.
//
// LIMITACAO (best-effort): construimos um grafo cujos nos sao pontos "snapados"
// numa grade de tolerancia SNAP_TOL. Procuramos ciclos simples curtos (ate
// MAX_CYCLE_EDGES arestas) priorizando ambientes pequenos, e deduplicamos ciclos
// equivalentes (mesma rotacao/sentido). Nao garante todos os ciclos possiveis;
// o limite de tamanho evita explosao combinatoria em plantas densas.
// ----------------------------------------------------------------------------

const MAX_CYCLE_EDGES = 12;

// Gera uma chave estavel para um ponto, alinhada a grade de snap.
function snapKey(x: number, y: number): string {
  const sx = Math.round(x / SNAP_TOL);
  const sy = Math.round(y / SNAP_TOL);
  return `${sx},${sy}`;
}

export function findClosedPolygons(segments: Segment[]): Point[][] {
  // Mapeia chave -> indice do no e guarda a coordenada representativa.
  const keyToId = new Map<string, number>();
  const nodes: Point[] = [];

  function nodeId(x: number, y: number): number {
    const k = snapKey(x, y);
    const existing = keyToId.get(k);
    if (existing !== undefined) return existing;
    const id = nodes.length;
    keyToId.set(k, id);
    nodes.push({ x, y });
    return id;
  }

  // Lista de adjacencia (conjunto de vizinhos por no, sem multiarestas).
  const adj: Set<number>[] = [];
  function ensureNode(id: number) {
    while (adj.length <= id) adj.push(new Set<number>());
  }

  for (const s of segments) {
    const a = nodeId(s.x1, s.y1);
    const b = nodeId(s.x2, s.y2);
    if (a === b) continue; // ignora arestas degeneradas
    ensureNode(a);
    ensureNode(b);
    adj[a].add(b);
    adj[b].add(a);
  }

  const polygons: Point[][] = [];
  const seenCycles = new Set<string>();

  // Canonicaliza um ciclo (lista de ids) para deduplicacao invariante a
  // ponto de partida e sentido de percurso.
  function canonicalCycle(ids: number[]): string {
    const n = ids.length;
    const rotations: string[] = [];
    for (let dir = 0; dir < 2; dir++) {
      const seq = dir === 0 ? ids : [...ids].reverse();
      // Comeca cada rotacao pelo menor id para normalizar.
      for (let start = 0; start < n; start++) {
        const rot: number[] = [];
        for (let i = 0; i < n; i++) rot.push(seq[(start + i) % n]);
        rotations.push(rot.join(","));
      }
    }
    rotations.sort();
    return rotations[0];
  }

  // Busca em profundidade limitada por no inicial, registrando ciclos simples.
  function dfs(start: number, current: number, path: number[], visited: Set<number>) {
    if (path.length > MAX_CYCLE_EDGES) return;
    for (const next of adj[current]) {
      if (next === start && path.length >= 3) {
        // Fechou um ciclo de tamanho valido.
        const key = canonicalCycle(path);
        if (!seenCycles.has(key)) {
          seenCycles.add(key);
          polygons.push(path.map((id) => nodes[id]));
        }
        continue;
      }
      // So avanca para ids maiores que o start para nao revisitar o mesmo
      // ciclo por outro ponto de entrada, e evita nos ja no caminho.
      if (next <= start) continue;
      if (visited.has(next)) continue;
      visited.add(next);
      path.push(next);
      dfs(start, next, path, visited);
      path.pop();
      visited.delete(next);
    }
  }

  for (let i = 0; i < adj.length; i++) {
    if (!adj[i] || adj[i].size < 2) continue;
    const visited = new Set<number>([i]);
    dfs(i, i, [i], visited);
  }

  // Prioriza ciclos menores (ambientes) primeiro.
  polygons.sort((a, b) => polygonAreaUnits(a) - polygonAreaUnits(b));
  return polygons;
}

// ----------------------------------------------------------------------------
// Assinatura de simbolo: vetor numerico invariante a translacao e escala.
// Estrategia: normaliza pelo bounding box, monta dois histogramas de tamanho
// fixo (comprimentos relativos e angulos em [0,pi)), concatenados. Determinista.
// ----------------------------------------------------------------------------

const LEN_BINS = 8;
const ANG_BINS = 8;

export function symbolSignature(segments: Segment[]): number[] {
  const sig = new Array<number>(LEN_BINS + ANG_BINS).fill(0);
  if (segments.length === 0) return sig;

  // Bounding box para normalizacao de escala (invariancia a translacao implicita).
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const s of segments) {
    minX = Math.min(minX, s.x1, s.x2);
    minY = Math.min(minY, s.y1, s.y2);
    maxX = Math.max(maxX, s.x1, s.x2);
    maxY = Math.max(maxY, s.y1, s.y2);
  }
  const diag = Math.hypot(maxX - minX, maxY - minY);
  const scale = diag > 1e-9 ? diag : 1;

  for (const s of segments) {
    const len = segmentLengthUnits(s) / scale; // comprimento relativo em [0,1] aprox.
    // Histograma de comprimentos.
    let lb = Math.floor(len * LEN_BINS);
    if (lb < 0) lb = 0;
    if (lb >= LEN_BINS) lb = LEN_BINS - 1;
    sig[lb] += 1;

    // Angulo dobrado para [0,pi) (segmento sem orientacao).
    let ang = Math.atan2(s.y2 - s.y1, s.x2 - s.x1);
    if (ang < 0) ang += Math.PI;
    if (ang >= Math.PI) ang -= Math.PI;
    let ab = Math.floor((ang / Math.PI) * ANG_BINS);
    if (ab < 0) ab = 0;
    if (ab >= ANG_BINS) ab = ANG_BINS - 1;
    sig[LEN_BINS + ab] += 1;
  }

  // Normaliza para vetor unitario (L2), tornando a assinatura invariante a
  // quantidade absoluta de segmentos e comparavel por cosseno.
  let norm = 0;
  for (const v of sig) norm += v * v;
  norm = Math.sqrt(norm);
  if (norm > 1e-9) {
    for (let i = 0; i < sig.length; i++) sig[i] /= norm;
  }
  return sig;
}

// Compara duas assinaturas por similaridade de cosseno. Trata tamanhos
// diferentes preenchendo com zeros ate o maior comprimento. Retorna true se
// similaridade >= (1 - tolerance).
export function matchSymbol(ref: number[], cand: number[], tolerance: number): boolean {
  const n = Math.max(ref.length, cand.length);
  if (n === 0) return true;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < n; i++) {
    const a = ref[i] ?? 0;
    const b = cand[i] ?? 0;
    dot += a * b;
    na += a * a;
    nb += b * b;
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  const sim = denom > 1e-9 ? dot / denom : 0;
  return sim >= 1 - tolerance;
}
