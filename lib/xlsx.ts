// ─────────────────────────────────────────────────────────────────────────────
// Geração da planilha de quantitativos (.xlsx) a partir do ExportPayload.
// Agrega TODAS as páginas em abas: Resumo, Areas, Paredes, Contagens,
// Revestimentos e Premissas.
// ─────────────────────────────────────────────────────────────────────────────

import ExcelJS from "exceljs";
import type { ExportPayload } from "@/lib/types";

// Formato numérico padrão (2 casas decimais).
const NUM_FMT = "#,##0.00";
// Formato monetário (2 casas) usado nas colunas de custo.
const MONEY_FMT = "#,##0.00";

/** Aplica negrito a uma linha de cabeçalho. */
function estilizarCabecalho(row: ExcelJS.Row): void {
  row.font = { bold: true };
}

/** Marca uma linha como total (negrito) e aplica formato numérico nas colunas dadas. */
function estilizarTotal(row: ExcelJS.Row, colsNumericas: number[]): void {
  row.font = { bold: true };
  for (const c of colsNumericas) {
    row.getCell(c).numFmt = NUM_FMT;
  }
}

export async function buildWorkbook(payload: ExportPayload): Promise<Buffer> {
  const { projectName, premissas, pages } = payload;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "quantitativos";
  workbook.created = new Date();

  // ── Pré-agregações usadas no Resumo ─────────────────────────────────────────
  let totalAreaM2 = 0;
  let totalParedeM = 0;
  let totalRevestimentoM2 = 0;
  // Soma de contagens por nome de elemento.
  const contagensPorNome = new Map<string, number>();

  for (const pg of pages) {
    for (const r of pg.rooms) {
      totalAreaM2 += r.areaM2;
    }
    totalParedeM += pg.walls.totalLengthM;
    for (const c of pg.counts) {
      contagensPorNome.set(c.name, (contagensPorNome.get(c.name) ?? 0) + c.count);
    }
    for (const f of pg.finishes) {
      totalRevestimentoM2 += f.totalAreaM2;
    }
  }

  const unitCosts = premissas.unitCosts ?? {};
  // Há custos unitários relevantes para revestimentos?
  const temCustoRevestimento = pages.some((pg) =>
    pg.finishes.some((f) => typeof unitCosts[f.name] === "number"),
  );

  // ── Aba: Resumo ─────────────────────────────────────────────────────────────
  {
    const ws = workbook.addWorksheet("Resumo");
    ws.columns = [
      { key: "k", width: 32 },
      { key: "v", width: 20 },
    ];

    ws.addRow(["Projeto", projectName]).getCell(1).font = { bold: true };
    ws.addRow([]);

    const tituloTotais = ws.addRow(["Totais gerais", ""]);
    estilizarCabecalho(tituloTotais);

    const rArea = ws.addRow(["Área total (m²)", totalAreaM2]);
    rArea.getCell(2).numFmt = NUM_FMT;
    const rParede = ws.addRow(["Parede total (m)", totalParedeM]);
    rParede.getCell(2).numFmt = NUM_FMT;
    const rRev = ws.addRow(["Área total de revestimentos (m²)", totalRevestimentoM2]);
    rRev.getCell(2).numFmt = NUM_FMT;

    ws.addRow([]);
    const tituloCont = ws.addRow(["Contagens (por elemento)", ""]);
    estilizarCabecalho(tituloCont);
    const cabCont = ws.addRow(["Elemento", "Quantidade"]);
    estilizarCabecalho(cabCont);
    for (const [nome, qtd] of contagensPorNome) {
      ws.addRow([nome, qtd]);
    }
  }

  // ── Aba: Areas ──────────────────────────────────────────────────────────────
  {
    const ws = workbook.addWorksheet("Areas");
    ws.columns = [
      { header: "Página", key: "pagina", width: 10 },
      { header: "Ambiente", key: "ambiente", width: 32 },
      { header: "Área (m²)", key: "area", width: 14 },
      { header: "Origem", key: "origem", width: 14 },
    ];
    estilizarCabecalho(ws.getRow(1));

    let total = 0;
    for (const pg of pages) {
      for (const r of pg.rooms) {
        total += r.areaM2;
        const row = ws.addRow([pg.pageIndex + 1, r.label, r.areaM2, r.source]);
        row.getCell(3).numFmt = NUM_FMT;
      }
    }
    const rowTotal = ws.addRow(["Total", "", total, ""]);
    estilizarTotal(rowTotal, [3]);
  }

  // ── Aba: Paredes ────────────────────────────────────────────────────────────
  {
    const ws = workbook.addWorksheet("Paredes");
    ws.columns = [
      { header: "Página", key: "pagina", width: 10 },
      { header: "Comprimento total (m)", key: "comp", width: 22 },
      { header: "Qtd. segmentos", key: "segs", width: 16 },
    ];
    estilizarCabecalho(ws.getRow(1));

    let total = 0;
    let totalSegs = 0;
    for (const pg of pages) {
      total += pg.walls.totalLengthM;
      const nSegs = pg.walls.segments.length;
      totalSegs += nSegs;
      const row = ws.addRow([pg.pageIndex + 1, pg.walls.totalLengthM, nSegs]);
      row.getCell(2).numFmt = NUM_FMT;
    }
    const rowTotal = ws.addRow(["Total", total, totalSegs]);
    estilizarTotal(rowTotal, [2]);
  }

  // ── Aba: Contagens ──────────────────────────────────────────────────────────
  {
    const ws = workbook.addWorksheet("Contagens");
    ws.columns = [
      { header: "Página", key: "pagina", width: 10 },
      { header: "Elemento", key: "elemento", width: 32 },
      { header: "Quantidade", key: "qtd", width: 14 },
    ];
    estilizarCabecalho(ws.getRow(1));

    let total = 0;
    for (const pg of pages) {
      for (const c of pg.counts) {
        total += c.count;
        ws.addRow([pg.pageIndex + 1, c.name, c.count]);
      }
    }
    const rowTotal = ws.addRow(["Total", "", total]);
    rowTotal.font = { bold: true };
  }

  // ── Aba: Revestimentos ──────────────────────────────────────────────────────
  {
    const ws = workbook.addWorksheet("Revestimentos");
    const colunas: Partial<ExcelJS.Column>[] = [
      { header: "Página", key: "pagina", width: 10 },
      { header: "Revestimento", key: "rev", width: 28 },
      { header: "Área base (m²)", key: "base", width: 16 },
      { header: "Perda (%)", key: "perda", width: 12 },
      { header: "Área total (m²)", key: "atot", width: 16 },
    ];
    if (temCustoRevestimento) {
      colunas.push({ header: "Custo unit. (R$/m²)", key: "cunit", width: 18 });
      colunas.push({ header: "Custo total (R$)", key: "ctot", width: 18 });
    }
    ws.columns = colunas;
    estilizarCabecalho(ws.getRow(1));

    let totalBase = 0;
    let totalAtot = 0;
    let totalCusto = 0;
    for (const pg of pages) {
      for (const f of pg.finishes) {
        totalBase += f.baseAreaM2;
        totalAtot += f.totalAreaM2;
        // Perda armazenada como fração (0.1 = 10%); exibimos em pontos percentuais.
        const valores: (string | number)[] = [
          pg.pageIndex + 1,
          f.name,
          f.baseAreaM2,
          f.lossPct * 100,
          f.totalAreaM2,
        ];
        if (temCustoRevestimento) {
          const cunit = unitCosts[f.name];
          if (typeof cunit === "number") {
            const ctot = f.totalAreaM2 * cunit;
            totalCusto += ctot;
            valores.push(cunit, ctot);
          } else {
            valores.push("", "");
          }
        }
        const row = ws.addRow(valores);
        row.getCell(3).numFmt = NUM_FMT;
        row.getCell(4).numFmt = NUM_FMT;
        row.getCell(5).numFmt = NUM_FMT;
        if (temCustoRevestimento) {
          row.getCell(6).numFmt = MONEY_FMT;
          row.getCell(7).numFmt = MONEY_FMT;
        }
      }
    }

    const linhaTotal: (string | number)[] = ["Total", "", totalBase, "", totalAtot];
    if (temCustoRevestimento) {
      linhaTotal.push("", totalCusto);
    }
    const rowTotal = ws.addRow(linhaTotal);
    const colsNum = temCustoRevestimento ? [3, 5, 7] : [3, 5];
    estilizarTotal(rowTotal, colsNum);
    if (temCustoRevestimento) {
      rowTotal.getCell(7).numFmt = MONEY_FMT;
    }
  }

  // ── Aba: Premissas ──────────────────────────────────────────────────────────
  {
    const ws = workbook.addWorksheet("Premissas");
    ws.columns = [
      { header: "Chave", key: "k", width: 30 },
      { header: "Valor", key: "v", width: 70 },
    ];
    estilizarCabecalho(ws.getRow(1));

    const add = (k: string, v: string): void => {
      ws.addRow([k, v]);
    };

    add("areaLabelRegex", premissas.areaLabelRegex);
    add("wallFilter.colors", premissas.wallFilter.colors.join(", "));
    add("wallFilter.minWidth", String(premissas.wallFilter.minWidth));
    add(
      "wallFilter.maxWidth",
      premissas.wallFilter.maxWidth === null ? "(sem limite)" : String(premissas.wallFilter.maxWidth),
    );

    ws.addRow([]);
    estilizarCabecalho(ws.addRow(["Símbolos", "tolerância | assinatura"]));
    for (const s of premissas.symbols) {
      add(s.name, `${s.tolerance} | [${s.signature.join(", ")}]`);
    }

    ws.addRow([]);
    estilizarCabecalho(ws.addRow(["Contagens por texto", "padrão"]));
    for (const t of premissas.textCounts) {
      add(t.name, t.pattern);
    }

    ws.addRow([]);
    estilizarCabecalho(ws.addRow(["Revestimentos", "perda (%) | rótulos"]));
    for (const f of premissas.finishes) {
      add(f.name, `${f.lossPct * 100} | ${f.roomLabels.join(", ")}`);
    }

    if (premissas.unitCosts && Object.keys(premissas.unitCosts).length > 0) {
      ws.addRow([]);
      estilizarCabecalho(ws.addRow(["Custos unitários", "valor"]));
      for (const [nome, valor] of Object.entries(premissas.unitCosts)) {
        const row = ws.addRow([nome, valor]);
        row.getCell(2).numFmt = MONEY_FMT;
      }
    }
  }

  const buf = await workbook.xlsx.writeBuffer();
  return Buffer.from(buf);
}
