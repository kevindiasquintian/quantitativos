import { buildBudgetWorkbook } from "@/lib/ifcXlsx";
import type { BudgetResult } from "@/lib/budget";

export const runtime = "nodejs";

// Recebe o resultado do orçamento (JSON) e devolve a planilha .xlsx.
export async function POST(req: Request): Promise<Response> {
  try {
    const body = (await req.json()) as {
      projectName?: string;
      items?: unknown;
      detail?: unknown;
      byType?: unknown;
    };
    const budget: BudgetResult = {
      items: Array.isArray(body.items) ? (body.items as BudgetResult["items"]) : [],
      detail: Array.isArray(body.detail) ? (body.detail as BudgetResult["detail"]) : [],
      byType: Array.isArray(body.byType) ? (body.byType as BudgetResult["byType"]) : [],
    };
    const buf = await buildBudgetWorkbook(body.projectName || "Projeto", budget);
    return new Response(new Uint8Array(buf), {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${(body.projectName || "quantitativos").replace(/[^a-zA-Z0-9_-]/g, "_")}.xlsx"`,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro ao exportar.";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
