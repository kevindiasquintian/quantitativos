import ExcelJS from "exceljs";
import type { BudgetResult, TypeSummary, ElementDetail } from "@/lib/budget";

// Item da planilha (pode trazer preço unitário informado no app).
export interface BudgetRow {
  codigo: string;
  etapa: string;
  descricao: string;
  unidade: string;
  quantidade: number;
  criterio?: string;
  estimado?: boolean;
  precoUnitario?: number;
}

export async function buildBudgetWorkbook(
  projectName: string,
  rows: BudgetRow[],
  byType: TypeSummary[],
  detail: ElementDetail[],
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Quantitativos IFC";

  // --- Orçamento ---
  const orc = wb.addWorksheet("Orçamento");
  orc.columns = [
    { header: "Código", key: "codigo", width: 9 },
    { header: "Etapa", key: "etapa", width: 22 },
    { header: "Serviço", key: "descricao", width: 46 },
    { header: "Unid.", key: "un", width: 8 },
    { header: "Quantidade", key: "qtd", width: 13 },
    { header: "Preço unit. (R$)", key: "pu", width: 16 },
    { header: "Total (R$)", key: "total", width: 16 },
    { header: "Critério / obs.", key: "criterio", width: 42 },
  ];
  orc.getRow(1).font = { bold: true };

  let grand = 0;
  for (const r of rows) {
    const pu = r.precoUnitario ?? 0;
    const total = pu * r.quantidade;
    grand += total;
    orc.addRow({
      codigo: r.codigo,
      etapa: r.etapa,
      descricao: r.descricao + (r.estimado ? " (estimado)" : ""),
      un: r.unidade,
      qtd: r.quantidade,
      pu: pu || null,
      total: total || null,
      criterio: r.criterio ?? "",
    });
  }
  const totalRow = orc.addRow({ descricao: "TOTAL GERAL", total: grand || null });
  totalRow.font = { bold: true };
  orc.getColumn("qtd").numFmt = "#,##0.00";
  orc.getColumn("pu").numFmt = '"R$" #,##0.00';
  orc.getColumn("total").numFmt = '"R$" #,##0.00';

  // --- Resumo por tipo ---
  const res = wb.addWorksheet("Resumo por tipo");
  res.columns = [
    { header: "Tipo", key: "tipo", width: 18 },
    { header: "Qtd.", key: "n", width: 8 },
    { header: "Área (m²)", key: "a", width: 14 },
    { header: "Comprimento (m)", key: "c", width: 16 },
    { header: "Volume (m³)", key: "v", width: 14 },
  ];
  res.getRow(1).font = { bold: true };
  byType.forEach((t) => res.addRow({ tipo: t.tipo, n: t.count, a: t.areaM2, c: t.comprimentoM, v: t.volumeM3 }));
  ["a", "c", "v"].forEach((k) => (res.getColumn(k).numFmt = "#,##0.00"));

  // --- Detalhe por elemento ---
  const det = wb.addWorksheet("Detalhe");
  det.columns = [
    { header: "Tipo", key: "tipo", width: 14 },
    { header: "Nome", key: "nome", width: 50 },
    { header: "GUID", key: "guid", width: 24 },
    { header: "Área (m²)", key: "a", width: 12 },
    { header: "Comp. (m)", key: "c", width: 12 },
    { header: "Volume (m³)", key: "v", width: 12 },
  ];
  det.getRow(1).font = { bold: true };
  detail.forEach((e) => det.addRow({ tipo: e.tipo, nome: e.nome, guid: e.guid, a: e.areaM2, c: e.comprimentoM, v: e.volumeM3 }));
  ["a", "c", "v"].forEach((k) => (det.getColumn(k).numFmt = "#,##0.00"));

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

// (mantém BudgetResult acessível para tipagem do chamador)
export type { BudgetResult };
