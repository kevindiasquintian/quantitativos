import ExcelJS from "exceljs";
import type { BudgetResult } from "@/lib/budget";

// Gera a planilha de quantitativos/orçamento a partir do resultado do IFC.
export async function buildBudgetWorkbook(
  projectName: string,
  budget: BudgetResult,
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Quantitativos IFC";

  // --- Orçamento ---
  const orc = wb.addWorksheet("Orçamento");
  orc.columns = [
    { header: "Item", key: "item", width: 8 },
    { header: "Serviço", key: "servico", width: 46 },
    { header: "Unid.", key: "un", width: 8 },
    { header: "Quantidade", key: "qtd", width: 14 },
  ];
  orc.getRow(1).font = { bold: true };
  budget.items.forEach((it, i) => {
    orc.addRow({ item: i + 1, servico: it.servico, un: it.unidade, qtd: it.quantidade });
  });
  orc.getColumn("qtd").numFmt = "#,##0.00";

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
  budget.byType.forEach((t) =>
    res.addRow({ tipo: t.tipo, n: t.count, a: t.areaM2, c: t.comprimentoM, v: t.volumeM3 }),
  );
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
  budget.detail.forEach((e) =>
    det.addRow({ tipo: e.tipo, nome: e.nome, guid: e.guid, a: e.areaM2, c: e.comprimentoM, v: e.volumeM3 }),
  );
  ["a", "c", "v"].forEach((k) => (det.getColumn(k).numFmt = "#,##0.00"));

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}
