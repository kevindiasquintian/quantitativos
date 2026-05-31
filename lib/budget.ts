// ─────────────────────────────────────────────────────────────────────────────
// Tradução dos elementos IFC para linguagem de ORÇAMENTO (quantitativos).
// Gera itens de serviço (descrição, unidade, quantidade) + detalhamento e
// um resumo por tipo de elemento.
// ─────────────────────────────────────────────────────────────────────────────

import type { IfcElement } from "@/lib/ifc";

export interface BudgetItem {
  servico: string;
  unidade: "m²" | "m³" | "m" | "un";
  quantidade: number;
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

const wallArea = (e: IfcElement) =>
  e.q.NetSideArea ?? e.q.GrossSideArea ?? e.q.Area ?? 0;
const slabArea = (e: IfcElement) =>
  e.q.GrossArea ?? e.q.NetArea ?? e.q.Area ?? e.q.GrossFootprintArea ?? 0;
const len = (e: IfcElement) => e.q.Length ?? e.q.Perimeter ?? 0;
const vol = (e: IfcElement) => e.q.NetVolume ?? e.q.GrossVolume ?? 0;

/** Rótulo amigável em PT-BR de orçamento por tipo de elemento. */
function tipoLabel(t: string): string {
  switch (t) {
    case "IFCWALL":
    case "IFCWALLSTANDARDCASE":
      return "Parede";
    case "IFCSLAB":
      return "Laje";
    case "IFCROOF":
      return "Cobertura";
    case "IFCDOOR":
      return "Porta";
    case "IFCWINDOW":
      return "Janela";
    case "IFCCOLUMN":
      return "Pilar";
    case "IFCBEAM":
      return "Viga";
    case "IFCCOVERING":
      return "Revestimento";
    case "IFCFOOTING":
      return "Fundação";
    case "IFCSTAIR":
      return "Escada";
    default:
      return t.replace(/^IFC/, "");
  }
}

const isExternalWall = (n: string) => /ytter|extern|fachada|external/i.test(n);
const isRoofLike = (n: string) => /tak|roof|cobert|telhad/i.test(n);

export function buildBudget(elements: IfcElement[]): BudgetResult {
  const detail: ElementDetail[] = [];
  const byTypeMap = new Map<string, TypeSummary>();

  // acumuladores de orçamento
  let paredeExtArea = 0,
    paredeIntArea = 0,
    paredeVol = 0,
    paredeLen = 0;
  let lajeArea = 0,
    lajeVol = 0;
  let coberturaArea = 0;
  let portas = 0,
    janelas = 0,
    pilares = 0,
    vigas = 0;

  for (const e of elements) {
    const a =
      e.type === "IFCSLAB" || e.type === "IFCROOF" ? slabArea(e) : wallArea(e);
    const l = len(e);
    const v = vol(e);

    detail.push({
      tipo: tipoLabel(e.type),
      nome: e.name,
      guid: e.guid,
      areaM2: a,
      comprimentoM: l,
      volumeM3: v,
    });

    const ts = byTypeMap.get(e.type) ?? {
      tipo: tipoLabel(e.type),
      count: 0,
      areaM2: 0,
      comprimentoM: 0,
      volumeM3: 0,
    };
    ts.count++;
    ts.areaM2 += a;
    ts.comprimentoM += l;
    ts.volumeM3 += v;
    byTypeMap.set(e.type, ts);

    switch (e.type) {
      case "IFCWALL":
      case "IFCWALLSTANDARDCASE":
        paredeLen += l;
        paredeVol += v;
        if (isExternalWall(e.name)) paredeExtArea += a;
        else paredeIntArea += a;
        break;
      case "IFCSLAB":
        if (isRoofLike(e.name)) coberturaArea += a;
        else {
          lajeArea += a;
          lajeVol += v;
        }
        break;
      case "IFCROOF":
        coberturaArea += a;
        break;
      case "IFCDOOR":
        portas++;
        break;
      case "IFCWINDOW":
        janelas++;
        break;
      case "IFCCOLUMN":
        pilares++;
        break;
      case "IFCBEAM":
        vigas++;
        break;
    }
  }

  const items: BudgetItem[] = [];
  const add = (servico: string, unidade: BudgetItem["unidade"], q: number) => {
    if (q > 0) items.push({ servico, unidade, quantidade: Math.round(q * 100) / 100 });
  };

  add("Alvenaria de vedação — parede externa", "m²", paredeExtArea);
  add("Alvenaria de vedação — parede interna", "m²", paredeIntArea);
  add("Paredes — comprimento total", "m", paredeLen);
  add("Paredes — volume", "m³", paredeVol);
  add("Laje / piso — área", "m²", lajeArea);
  add("Laje — volume de concreto", "m³", lajeVol);
  add("Cobertura (telhado) — área", "m²", coberturaArea);
  add("Portas", "un", portas);
  add("Janelas", "un", janelas);
  add("Pilares", "un", pilares);
  add("Vigas", "un", vigas);

  const byType = [...byTypeMap.values()].sort((a, b) => b.areaM2 - a.areaM2);
  return { items, detail, byType };
}
