// ─────────────────────────────────────────────────────────────────────────────
// Tradução dos elementos IFC para PLANILHA ORÇAMENTÁRIA (quantitativos).
// Catálogo de serviços por macro-etapa definido com apoio do agente
// "orçamentista-de-obra" (.claude/agents). Itens marcados como `estimado`
// derivam de premissas (forma/aço por taxa) — não vêm direto do IFC.
// ─────────────────────────────────────────────────────────────────────────────

import type { IfcElement } from "@/lib/ifc";

export interface BudgetItem {
  codigo: string;
  etapa: string;
  descricao: string;
  unidade: "m²" | "m³" | "m" | "kg" | "un" | "vb";
  quantidade: number;
  criterio: string;
  /** true quando o valor vem de premissa (não medido direto do IFC). */
  estimado: boolean;
  /** expressIDs (#N do IFC) dos objetos paramétricos que compõem este item. */
  sourceIds: number[];
}

export interface ElementDetail {
  tipo: string;
  nome: string;
  guid: string;
  areaM2: number;
  comprimentoM: number;
  volumeM3: number;
}

export interface TypeSummary {
  tipo: string;
  count: number;
  areaM2: number;
  comprimentoM: number;
  volumeM3: number;
}

export interface BudgetResult {
  items: BudgetItem[];
  detail: ElementDetail[];
  byType: TypeSummary[];
}

const isWall = (t: string) => t === "IFCWALL" || t === "IFCWALLSTANDARDCASE";
const isExternal = (n: string) => /ytter|extern|fachada|external|IsExternal/i.test(n);
const isRoofLike = (n: string) => /tak|roof|cobert|telhad/i.test(n);

const wallArea = (e: IfcElement) =>
  e.q.NetSideArea ?? e.q.GrossSideArea ?? e.q.Area ?? 0;

// Para lajes e coberturas, a ÁREA PROJETADA (horizontal) é o que importa no
// orçamento: GrossFootprintArea > GrossArea (que pode ser a superfície inclinada).
const slabProjectedArea = (e: IfcElement) =>
  e.q.GrossFootprintArea ?? e.q.NetArea ?? e.q.GrossArea ?? e.q.Area ?? 0;

const elemVol = (e: IfcElement) => e.q.NetVolume ?? e.q.GrossVolume ?? 0;
const elemLen = (e: IfcElement) => e.q.Length ?? e.q.Perimeter ?? 0;
const openingArea = (e: IfcElement) =>
  e.q.Area ?? (e.q.Width && e.q.Height ? e.q.Width * e.q.Height : 0);

function tipoLabel(t: string): string {
  const m: Record<string, string> = {
    IFCWALL: "Parede",
    IFCWALLSTANDARDCASE: "Parede",
    IFCSLAB: "Laje",
    IFCROOF: "Cobertura",
    IFCDOOR: "Porta",
    IFCWINDOW: "Janela",
    IFCCOLUMN: "Pilar",
    IFCBEAM: "Viga",
    IFCCOVERING: "Revestimento",
    IFCFOOTING: "Fundação",
    IFCSTAIR: "Escada",
  };
  return m[t] ?? t.replace(/^IFC/, "");
}

export function buildBudget(elements: IfcElement[]): BudgetResult {
  const detail: ElementDetail[] = [];
  const byTypeMap = new Map<string, TypeSummary>();

  // Agregados
  let wallExtArea = 0,
    wallIntArea = 0,
    wallLenExt = 0;
  let slabVol = 0,
    slabAreaPiso = 0,
    slabAreaTotal = 0,
    maxPisoArea = 0;
  let roofArea = 0;
  let footingVol = 0,
    columnVol = 0,
    beamVol = 0;
  let portas = 0,
    janelas = 0,
    vaoPortas = 0,
    vaoJanelas = 0;

  // Buckets de expressIDs por categoria (objetos-fonte de cada item).
  const src = {
    wallExt: [] as number[],
    wallInt: [] as number[],
    slabPiso: [] as number[],
    roof: [] as number[],
    footing: [] as number[],
    column: [] as number[],
    beam: [] as number[],
    doors: [] as number[],
    windows: [] as number[],
  };

  for (const e of elements) {
    const isSlabRoof = e.type === "IFCSLAB" || e.type === "IFCROOF";
    const a = isSlabRoof ? slabProjectedArea(e) : wallArea(e);
    const l = elemLen(e);
    const v = elemVol(e);

    detail.push({ tipo: tipoLabel(e.type), nome: e.name, guid: e.guid, areaM2: a, comprimentoM: l, volumeM3: v });
    const ts = byTypeMap.get(e.type) ?? { tipo: tipoLabel(e.type), count: 0, areaM2: 0, comprimentoM: 0, volumeM3: 0 };
    ts.count++;
    ts.areaM2 += a;
    ts.comprimentoM += l;
    ts.volumeM3 += v;
    byTypeMap.set(e.type, ts);

    if (isWall(e.type)) {
      if (isExternal(e.name)) {
        wallLenExt += l;
        wallExtArea += a;
        src.wallExt.push(e.id);
      } else {
        wallIntArea += a;
        src.wallInt.push(e.id);
      }
    } else if (e.type === "IFCSLAB") {
      if (isRoofLike(e.name)) {
        roofArea += a;
        src.roof.push(e.id);
      } else {
        slabVol += v;
        slabAreaPiso += a;
        slabAreaTotal += a;
        if (a > maxPisoArea) maxPisoArea = a;
        src.slabPiso.push(e.id);
      }
    } else if (e.type === "IFCROOF") {
      // Usa GrossFootprintArea (projeção horizontal); derivada pelo parser das
      // paredes quando o elemento não tem geometria própria.
      roofArea += a;
      src.roof.push(e.id);
    } else if (e.type === "IFCFOOTING") {
      footingVol += v;
      src.footing.push(e.id);
    } else if (e.type === "IFCCOLUMN") {
      columnVol += v;
      src.column.push(e.id);
    } else if (e.type === "IFCBEAM") {
      beamVol += v;
      src.beam.push(e.id);
    } else if (e.type === "IFCDOOR") {
      portas++;
      vaoPortas += openingArea(e);
      src.doors.push(e.id);
    } else if (e.type === "IFCWINDOW") {
      janelas++;
      vaoJanelas += openingArea(e);
      src.windows.push(e.id);
    }
  }

  const wallAll = [...src.wallExt, ...src.wallInt];
  const superSrc = [...src.column, ...src.beam, ...src.slabPiso];

  // Se não há área de cobertura confiável (> 0 e proporcional à edificação),
  // usa a área do piso como projeção do telhado — para uma planta de um pavimento
  // a área projetada da cobertura ≈ área projetada da laje de piso.
  // Se a área de cobertura retornada é a superfície inclinada real (> 2× a projeção
  // estimada pela laje de piso), ou zero, usa a laje de piso como melhor estimativa
  // da área projetada. Para telhados em duas águas, cada aba tem ~60% da projeção.
  const roofFallback = slabAreaPiso > 0 ? slabAreaPiso : maxPisoArea;
  let roofSrc = src.roof;
  if (roofArea <= 0 || (roofFallback > 0 && roofArea > roofFallback * 2)) {
    roofArea = roofFallback > 0 ? roofFallback : roofArea;
    // a área passou a vir das lajes de piso → os objetos-fonte também.
    if (src.slabPiso.length) roofSrc = src.slabPiso;
  }

  // Área de paredes a revestir: externa = 1 face; interna = 2 faces.
  const areaRevest = wallExtArea + 2 * wallIntArea;
  const superVol = columnVol + beamVol + slabVol;

  const items: BudgetItem[] = [];
  const add = (
    codigo: string,
    etapa: string,
    descricao: string,
    unidade: BudgetItem["unidade"],
    quantidade: number,
    criterio: string,
    sourceIds: number[],
    estimado = false,
  ) => {
    if (quantidade > 0)
      items.push({ codigo, etapa, descricao, unidade, quantidade: Math.round(quantidade * 100) / 100, criterio, estimado, sourceIds: [...new Set(sourceIds)] });
  };

  // 1. Serviços preliminares
  add("1.1", "Serviços preliminares", "Limpeza e preparo do terreno (projeção)", "m²", maxPisoArea, "Área de projeção (maior laje de piso).", src.slabPiso, true);
  add("1.2", "Serviços preliminares", "Locação da obra (gabarito)", "m", wallLenExt, "Perímetro das paredes externas.", src.wallExt);

  // 2. Fundações
  add("2.1", "Fundações", "Concreto estrutural em fundações", "m³", footingVol, "Volume de concreto das fundações.", src.footing);
  add("2.2", "Fundações", "Formas para fundações", "m²", footingVol * 3, "≈3,0 m²/m³ de concreto de fundação.", src.footing, true);
  add("2.3", "Fundações", "Armadura CA-50 em fundações", "kg", footingVol * 80, "≈80 kg/m³ (taxa de armadura).", src.footing, true);

  // 3. Superestrutura
  add("3.1", "Superestrutura", "Concreto estrutural em pilares", "m³", columnVol, "Volume de concreto dos pilares.", src.column);
  add("3.2", "Superestrutura", "Concreto estrutural em vigas", "m³", beamVol, "Volume de concreto das vigas.", src.beam);
  add("3.3", "Superestrutura", "Concreto estrutural em lajes", "m³", slabVol, "Volume de concreto das lajes.", src.slabPiso);
  add("3.4", "Superestrutura", "Formas para pilares, vigas e lajes", "m²", superVol * 10, "≈10 m²/m³ de concreto da superestrutura.", superSrc, true);
  add("3.5", "Superestrutura", "Armadura CA-50 (superestrutura)", "kg", superVol * 100, "≈100 kg/m³ (taxa de armadura).", superSrc, true);

  // 4. Alvenaria / Vedações
  add("4.1", "Alvenaria/Vedações", "Alvenaria de vedação — paredes externas", "m²", wallExtArea, "Área de face de parede externa.", src.wallExt);
  add("4.2", "Alvenaria/Vedações", "Alvenaria de vedação — paredes internas", "m²", wallIntArea, "Área de face de parede interna.", src.wallInt);

  // 5. Cobertura
  add("5.1", "Cobertura", "Cobertura / telhamento (inclui estrutura)", "m²", roofArea, "Área projetada (footprint horizontal) da cobertura.", roofSrc);

  // 6. Esquadrias
  add("6.1", "Esquadrias", "Porta completa (fornecimento e instalação)", "un", portas, "Contagem de portas.", src.doors);
  add("6.2", "Esquadrias", "Janela completa (fornecimento e instalação)", "un", janelas, "Contagem de janelas.", src.windows);
  add("6.3", "Esquadrias", "Vãos de portas (área)", "m²", vaoPortas, "Soma das áreas de vão das portas.", src.doors);
  add("6.4", "Esquadrias", "Vãos de janelas (área)", "m²", vaoJanelas, "Soma das áreas de vão das janelas.", src.windows);

  // 7. Revestimentos
  add("7.1", "Revestimentos", "Chapisco em paredes", "m²", areaRevest, "Faces de parede (ext. 1 face + int. 2 faces).", wallAll, true);
  add("7.2", "Revestimentos", "Emboço/massa única em paredes", "m²", areaRevest, "Mesma área do chapisco.", wallAll, true);
  add("7.3", "Revestimentos", "Reboco/acabamento em paredes", "m²", areaRevest, "Mesma área do emboço.", wallAll, true);

  // 8. Pisos
  add("8.1", "Pisos", "Contrapiso/regularização sobre laje", "m²", slabAreaPiso, "Área de piso (lajes de piso em planta).", src.slabPiso);
  add("8.2", "Pisos", "Revestimento de piso (assentado)", "m²", slabAreaPiso, "Mesma área do contrapiso.", src.slabPiso);

  // 9. Pintura
  add("9.1", "Pintura", "Pintura látex em paredes (2 demãos)", "m²", areaRevest, "Faces de parede revestidas.", wallAll, true);
  add("9.2", "Pintura", "Pintura de teto sobre laje", "m²", slabAreaTotal, "Área inferior das lajes (forro).", src.slabPiso, true);

  const byType = [...byTypeMap.values()].sort((a, b) => b.areaM2 - a.areaM2);
  return { items, detail, byType };
}
