// ─────────────────────────────────────────────────────────────────────────────
// Parser leve de IFC (STEP / ISO-10303-21) para quantitativos.
// Fonte principal: BaseQuantities (IFCQUANTITYAREA/LENGTH/VOLUME) quando
// disponíveis (ex.: Revit com QuantityTakeOff).
// Fallback: extração da geometria (IFCEXTRUDEDAREASOLID + IFCRECTANGLEPROFILEDEF)
// para IFCs sem BaseQuantities.
// Unidades: comprimento em mm normalizado para m; área mm²→m²; volume mm³→m³.
// ─────────────────────────────────────────────────────────────────────────────

export type QtyKind = "length" | "area" | "volume" | "count";

export interface IfcElement {
  id: number;
  type: string;
  name: string;
  guid: string;
  q: Record<string, number>;
}

const ELEMENT_TYPES = new Set([
  "IFCWALL",
  "IFCWALLSTANDARDCASE",
  "IFCSLAB",
  "IFCROOF",
  "IFCDOOR",
  "IFCWINDOW",
  "IFCCOLUMN",
  "IFCBEAM",
  "IFCCOVERING",
  "IFCSTAIR",
  "IFCRAILING",
  "IFCMEMBER",
  "IFCPLATE",
  "IFCFOOTING",
]);

export function decodeIfcText(s: string): string {
  if (!s) return s;
  s = s.replace(/\\X2\\([0-9A-Fa-f]+)\\X0\\/g, (_, hex: string) => {
    let out = "";
    for (let i = 0; i < hex.length; i += 4)
      out += String.fromCharCode(parseInt(hex.substr(i, 4), 16));
    return out;
  });
  s = s.replace(/\\X\\([0-9A-Fa-f]{2})/g, (_, hex: string) =>
    String.fromCharCode(parseInt(hex, 16)),
  );
  s = s.replace(/\\S\\(.)/g, (_, c: string) =>
    String.fromCharCode(c.charCodeAt(0) + 128),
  );
  return s.replace(/\\\\/g, "\\");
}

function splitArgs(s: string): string[] {
  const out: string[] = [];
  let depth = 0, inStr = false, cur = "";
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inStr) {
      cur += c;
      if (c === "'") {
        if (s[i + 1] === "'") { cur += "'"; i++; } else inStr = false;
      }
      continue;
    }
    if (c === "'") { inStr = true; cur += c; }
    else if (c === "(") { depth++; cur += c; }
    else if (c === ")") { depth--; cur += c; }
    else if (c === "," && depth === 0) { out.push(cur.trim()); cur = ""; }
    else cur += c;
  }
  if (cur.trim().length) out.push(cur.trim());
  return out;
}

function unquote(s: string): string {
  if (s.startsWith("'") && s.endsWith("'"))
    return decodeIfcText(s.slice(1, -1).replace(/''/g, "'"));
  return s;
}

function refIds(s: string): number[] {
  const m = s.match(/#(\d+)/g);
  return m ? m.map((x) => parseInt(x.slice(1), 10)) : [];
}

function firstRef(s: string): number | null {
  const m = s.match(/#(\d+)/);
  return m ? parseInt(m[1], 10) : null;
}

interface Stmt { id: number; type: string; args: string; }

function* statements(text: string): Generator<Stmt> {
  const start = text.indexOf("DATA;");
  const body = start >= 0 ? text.slice(start + 5) : text;
  const re = /#(\d+)\s*=\s*([A-Z0-9_]+)\s*\(([\s\S]*?)\)\s*;/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)))
    yield { id: parseInt(m[1], 10), type: m[2], args: m[3] };
}

function normalize(kind: QtyKind, value: number): number {
  if (kind === "length") return value / 1000;
  if (kind === "area") return value > 10000 ? value / 1e6 : value;
  if (kind === "volume") return value > 10000 ? value / 1e9 : value;
  return value;
}

// ─── Geometria ────────────────────────────────────────────────────────────────

interface RectProfile { xdim: number; ydim: number; }
interface ExtrudedSolid { profileRef: number; depth: number; }

/**
 * Para elementos sem BaseQuantities, tenta extrair quantidades a partir da
 * geometria (IFCEXTRUDEDAREASOLID + IFCRECTANGLEPROFILEDEF).
 * Todos os valores estão em mm / mm² / mm³ (normalização ocorre depois).
 */
function fillFromGeometry(
  elements: Map<number, IfcElement>,
  profiles: Map<number, RectProfile>,
  extrudeds: Map<number, ExtrudedSolid>,
  elemShapeItems: Map<number, number[]>, // elementId → list of geometry item IDs
): void {
  for (const [id, el] of elements) {
    if (Object.keys(el.q).length > 0) continue; // já tem BaseQty
    const items = elemShapeItems.get(id) ?? [];
    for (const itemId of items) {
      const ex = extrudeds.get(itemId);
      if (!ex) continue;
      const prof = profiles.get(ex.profileRef);
      if (!prof) continue;

      // Para paredes/colunas: XDim = espessura, YDim = comprimento (ou vice-versa).
      // Normalizamos: length = dimensão maior, width = menor.
      const len = Math.max(prof.xdim, prof.ydim); // mm
      const wid = Math.min(prof.xdim, prof.ydim); // mm (espessura)
      const hgt = ex.depth; // mm (altura)

      // Normaliza já para m / m² / m³ (mm → m).
      if (el.q.Length === undefined) el.q.Length = len / 1000;
      if (el.q.Width === undefined) el.q.Width = wid / 1000;
      if (el.q.Height === undefined) el.q.Height = hgt / 1000;
      if (el.q.NetSideArea === undefined) el.q.NetSideArea = (len * hgt) / 1e6;
      if (el.q.NetVolume === undefined)
        el.q.NetVolume = (prof.xdim * prof.ydim * hgt) / 1e9;
      if (el.q.GrossFootprintArea === undefined)
        el.q.GrossFootprintArea = (len * wid) / 1e6;
      break;
    }
  }
}

/**
 * Para IFCROOF sem geometria: deriva a área projetada (footprint) a partir do
 * bounding-box das paredes — produto dos dois comprimentos distintos mais comuns.
 */
function derivedRoofFootprint(elements: Map<number, IfcElement>): number {
  const isWall = (t: string) => t === "IFCWALL" || t === "IFCWALLSTANDARDCASE";
  const lengths: number[] = [];
  for (const el of elements.values()) {
    if (!isWall(el.type)) continue;
    const l = el.q.Length ?? el.q.NetSideArea ?? 0; // Length em mm (pré-normalização)
    if (l > 0) lengths.push(l);
  }
  if (lengths.length < 2) return 0;
  // Comprimentos já em metros (geometry-filled). Encontra as duas dimensões.
  lengths.sort((a, b) => b - a);
  const l1 = lengths[0];
  const l2 = lengths.find((l) => Math.abs(l - l1) / l1 > 0.05) ?? l1;
  return l1 * l2;
}

// ─── Parser principal ──────────────────────────────────────────────────────────

export interface IfcParseResult { elements: IfcElement[]; schema: string; }

export function parseIfc(text: string): IfcParseResult {
  const schemaMatch = text.match(/FILE_SCHEMA\(\('([^']+)'/);
  const schema = schemaMatch ? schemaMatch[1] : "?";

  const qty = new Map<number, { name: string; kind: QtyKind; value: number }>();
  const elemQty = new Map<number, { name: string; refs: number[] }>();
  const rels: Array<{ objs: number[]; def: number }> = [];
  const elements = new Map<number, IfcElement>();

  // Geometria
  const profiles = new Map<number, RectProfile>();
  const extrudeds = new Map<number, ExtrudedSolid>();
  // shapeRep id → list of geometry item ids
  const repItems = new Map<number, number[]>();
  // productDefShape id → list of shapeRep ids
  const defShapeReps = new Map<number, number[]>();
  // elementId → representation ref (arg 6 for most elements = IFC4/IFC2x3)
  const elemRepRef = new Map<number, number>();

  for (const st of statements(text)) {
    switch (st.type) {
      case "IFCQUANTITYLENGTH":
      case "IFCQUANTITYAREA":
      case "IFCQUANTITYVOLUME":
      case "IFCQUANTITYCOUNT": {
        const a = splitArgs(st.args);
        const name = unquote(a[0] ?? "");
        const value = parseFloat(a[a.length - 1]);
        const kind: QtyKind =
          st.type === "IFCQUANTITYLENGTH" ? "length"
          : st.type === "IFCQUANTITYAREA" ? "area"
          : st.type === "IFCQUANTITYVOLUME" ? "volume"
          : "count";
        if (Number.isFinite(value)) qty.set(st.id, { name, kind, value });
        break;
      }
      case "IFCELEMENTQUANTITY": {
        const a = splitArgs(st.args);
        const name = unquote(a[0] ?? "");
        const refs = refIds(a[a.length - 1] ?? "");
        elemQty.set(st.id, { name, refs });
        break;
      }
      case "IFCRELDEFINESBYPROPERTIES": {
        const a = splitArgs(st.args);
        const objs = refIds(a[4] ?? "");
        const def = refIds(a[a.length - 1] ?? "")[0];
        if (def) rels.push({ objs, def });
        break;
      }
      case "IFCRECTANGLEPROFILEDEF": {
        const a = splitArgs(st.args);
        // args: ProfileType, ProfileName, Position, XDim, YDim
        const xdim = parseFloat(a[3] ?? "0");
        const ydim = parseFloat(a[4] ?? "0");
        if (Number.isFinite(xdim) && Number.isFinite(ydim))
          profiles.set(st.id, { xdim, ydim });
        break;
      }
      case "IFCEXTRUDEDAREASOLID": {
        const a = splitArgs(st.args);
        // args: SweptArea, Position, ExtrudedDirection, Depth
        const profileRef = firstRef(a[0] ?? "");
        const depth = parseFloat(a[3] ?? "0");
        if (profileRef !== null && Number.isFinite(depth) && depth > 0)
          extrudeds.set(st.id, { profileRef, depth });
        break;
      }
      case "IFCSHAPEREPRESENTATION": {
        const a = splitArgs(st.args);
        // args: ContextOfItems, RepresentationIdentifier, RepresentationType, Items
        const items = refIds(a[3] ?? "");
        if (items.length) repItems.set(st.id, items);
        break;
      }
      case "IFCPRODUCTDEFINITIONSHAPE": {
        const a = splitArgs(st.args);
        // args: Name, Description, Representations
        const reps = refIds(a[2] ?? "");
        if (reps.length) defShapeReps.set(st.id, reps);
        break;
      }
      default:
        if (ELEMENT_TYPES.has(st.type)) {
          const a = splitArgs(st.args);
          const guid = unquote(a[0] ?? "");
          const name = unquote(a[2] ?? "");
          elements.set(st.id, { id: st.id, type: st.type, name, guid, q: {} });
          // Representation é o arg 6 (0-based) para IfcElement (IFC4 e IFC2x3).
          const repRef = firstRef(a[6] ?? "");
          if (repRef !== null) elemRepRef.set(st.id, repRef);
        }
    }
  }

  // Liga elementos → BaseQuantities.
  for (const rel of rels) {
    const eq = elemQty.get(rel.def);
    if (!eq) continue;
    for (const objId of rel.objs) {
      const el = elements.get(objId);
      if (!el) continue;
      for (const ref of eq.refs) {
        const q = qty.get(ref);
        if (!q) continue;
        const val = normalize(q.kind, q.value);
        // Mantém o menor (líquido) quando o Revit exporta bruto e líquido com o mesmo nome.
        el.q[q.name] = el.q[q.name] === undefined ? val : Math.min(el.q[q.name], val);
      }
    }
  }

  // Constrói mapa element → lista de itens de geometria.
  const elemShapeItems = new Map<number, number[]>();
  for (const [elId, defId] of elemRepRef) {
    const reps = defShapeReps.get(defId) ?? [];
    const items: number[] = [];
    for (const repId of reps) {
      for (const itemId of repItems.get(repId) ?? []) items.push(itemId);
    }
    if (items.length) elemShapeItems.set(elId, items);
  }

  // Fallback: preenche quantidades a partir da geometria para elementos sem BaseQty.
  fillFromGeometry(elements, profiles, extrudeds, elemShapeItems);

  // Para IFCROOF sem área: deriva da projeção das paredes ANTES de normalizar
  // (as quantidades geométricas ainda estão em mm neste ponto).
  for (const el of elements.values()) {
    if (el.type !== "IFCROOF") continue;
    const hasArea =
      (el.q.GrossFootprintArea ?? 0) || (el.q.GrossArea ?? 0) ||
      (el.q.NetArea ?? 0) || (el.q.Area ?? 0);
    if (hasArea > 0) continue;
    // derivedRoofFootprint lê Length (em mm) e converte para m internamente.
    const footprint = derivedRoofFootprint(elements);
    if (footprint > 0) {
      // Já retorna em m² — seta diretamente para não ser reprocessado.
      el.q._roofFootprintM2 = footprint;
    }
  }

  // Promove _roofFootprintM2 (já em m²) para GrossFootprintArea.
  for (const el of elements.values()) {
    if (el.q._roofFootprintM2 !== undefined) {
      el.q.GrossFootprintArea = el.q._roofFootprintM2;
      delete el.q._roofFootprintM2;
    }
  }

  return { elements: [...elements.values()], schema };
}
