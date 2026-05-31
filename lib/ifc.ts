// ─────────────────────────────────────────────────────────────────────────────
// Parser leve de IFC (STEP / ISO-10303-21) para quantitativos.
// Lê entidades #ID= TIPO(args), extrai elementos construtivos e suas
// BaseQuantities (Length/Area/Volume), normaliza unidades e devolve uma lista
// de elementos com quantidades em metros / m² / m³.
//
// Não é um parser IFC completo — foca no necessário para takeoff de quantidades.
// ─────────────────────────────────────────────────────────────────────────────

export type QtyKind = "length" | "area" | "volume" | "count";

export interface IfcElement {
  id: number;
  type: string; // ex.: "IFCWALLSTANDARDCASE"
  name: string; // ex.: "Basic Wall: Yttervägg Paroc"
  guid: string;
  /** quantidades normalizadas (m, m², m³), uma por nome. */
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

/** Decodifica escapes de texto do IFC (\X2\00E5\X0\, \X\E5, \S\). */
export function decodeIfcText(s: string): string {
  if (!s) return s;
  // \X2\....\X0\  (sequência de code units UTF-16 em hex)
  s = s.replace(/\\X2\\([0-9A-Fa-f]+)\\X0\\/g, (_, hex: string) => {
    let out = "";
    for (let i = 0; i < hex.length; i += 4) {
      out += String.fromCharCode(parseInt(hex.substr(i, 4), 16));
    }
    return out;
  });
  // \X\HH  (um byte em hex, latin-1)
  s = s.replace(/\\X\\([0-9A-Fa-f]{2})/g, (_, hex: string) =>
    String.fromCharCode(parseInt(hex, 16)),
  );
  // \S\x  -> caractere + 0x80 (ISO 8859); aproximação simples
  s = s.replace(/\\S\\(.)/g, (_, c: string) =>
    String.fromCharCode(c.charCodeAt(0) + 128),
  );
  s = s.replace(/\\\\/g, "\\");
  return s;
}

/** Quebra os argumentos de uma entidade em tokens de topo (respeita aspas e parênteses). */
function splitArgs(s: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let inStr = false;
  let cur = "";
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inStr) {
      cur += c;
      if (c === "'") {
        // aspa escapada ''
        if (s[i + 1] === "'") {
          cur += "'";
          i++;
        } else inStr = false;
      }
      continue;
    }
    if (c === "'") {
      inStr = true;
      cur += c;
    } else if (c === "(") {
      depth++;
      cur += c;
    } else if (c === ")") {
      depth--;
      cur += c;
    } else if (c === "," && depth === 0) {
      out.push(cur.trim());
      cur = "";
    } else {
      cur += c;
    }
  }
  if (cur.trim().length) out.push(cur.trim());
  return out;
}

function unquote(s: string): string {
  if (s.startsWith("'") && s.endsWith("'")) {
    return decodeIfcText(s.slice(1, -1).replace(/''/g, "'"));
  }
  return s;
}

function refIds(s: string): number[] {
  const m = s.match(/#(\d+)/g);
  return m ? m.map((x) => parseInt(x.slice(1), 10)) : [];
}

interface Stmt {
  id: number;
  type: string;
  args: string;
}

/** Itera as instruções #ID= TIPO(args); da seção DATA. */
function* statements(text: string): Generator<Stmt> {
  const start = text.indexOf("DATA;");
  const body = start >= 0 ? text.slice(start + 5) : text;
  const re = /#(\d+)\s*=\s*([A-Z0-9_]+)\s*\(([\s\S]*?)\)\s*;/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body))) {
    yield { id: parseInt(m[1], 10), type: m[2], args: m[3] };
  }
}

/** Normaliza um valor de quantidade para a unidade métrica (m, m², m³). */
function normalize(kind: QtyKind, value: number): number {
  if (kind === "length") return value / 1000; // arquivo usa mm
  if (kind === "area") return value > 10000 ? value / 1e6 : value; // mm² -> m²
  if (kind === "volume") return value > 10000 ? value / 1e9 : value; // mm³ -> m³
  return value;
}

export interface IfcParseResult {
  elements: IfcElement[];
  schema: string;
}

export function parseIfc(text: string): IfcParseResult {
  const schemaMatch = text.match(/FILE_SCHEMA\(\('([^']+)'/);
  const schema = schemaMatch ? schemaMatch[1] : "?";

  // 1) primeira passada: indexa quantidades, conjuntos e elementos.
  const qty = new Map<number, { name: string; kind: QtyKind; value: number }>();
  const elemQty = new Map<number, { name: string; refs: number[] }>();
  const rels: Array<{ objs: number[]; def: number }> = [];
  const elements = new Map<number, IfcElement>();

  for (const st of statements(text)) {
    if (st.type === "IFCQUANTITYLENGTH" || st.type === "IFCQUANTITYAREA" || st.type === "IFCQUANTITYVOLUME" || st.type === "IFCQUANTITYCOUNT") {
      const a = splitArgs(st.args);
      const name = unquote(a[0] ?? "");
      const value = parseFloat(a[a.length - 1]);
      const kind: QtyKind =
        st.type === "IFCQUANTITYLENGTH"
          ? "length"
          : st.type === "IFCQUANTITYAREA"
            ? "area"
            : st.type === "IFCQUANTITYVOLUME"
              ? "volume"
              : "count";
      if (Number.isFinite(value)) qty.set(st.id, { name, kind, value });
    } else if (st.type === "IFCELEMENTQUANTITY") {
      const a = splitArgs(st.args);
      const name = unquote(a[0] ?? "");
      const refs = refIds(a[a.length - 1] ?? "");
      elemQty.set(st.id, { name, refs });
    } else if (st.type === "IFCRELDEFINESBYPROPERTIES") {
      const a = splitArgs(st.args);
      const objs = refIds(a[4] ?? "");
      const def = refIds(a[a.length - 1] ?? "")[0];
      if (def) rels.push({ objs, def });
    } else if (ELEMENT_TYPES.has(st.type)) {
      const a = splitArgs(st.args);
      const guid = unquote(a[0] ?? "");
      const name = unquote(a[2] ?? ""); // Name (Family:Type:Id)
      elements.set(st.id, { id: st.id, type: st.type, name, guid, q: {} });
    }
  }

  // 2) liga elementos -> quantidades via IfcRelDefinesByProperties -> IfcElementQuantity
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
        // O Revit às vezes exporta a MESMA quantidade duas vezes (bruto x líquido,
        // com o mesmo nome). Para orçamento mantemos o menor (líquido, já sem vãos).
        el.q[q.name] =
          el.q[q.name] === undefined ? val : Math.min(el.q[q.name], val);
      }
    }
  }

  return { elements: [...elements.values()], schema };
}
