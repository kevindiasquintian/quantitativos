import { buildBudgetWorkbook, type BudgetRow } from "@/lib/ifcXlsx";
import type { ElementDetail } from "@/lib/budget";

export const runtime = "nodejs";

// Recebe o orçamento (com preços informados no app) e devolve a planilha .xlsx.
export async function POST(req: Request): Promise<Response> {
  try {
    const body = (await req.json()) as {
      projectName?: string;
      items?: BudgetRow[];
      detail?: ElementDetail[];
    };
    const buf = await buildBudgetWorkbook(
      body.projectName || "Projeto",
      Array.isArray(body.items) ? body.items : [],
      Array.isArray(body.detail) ? body.detail : [],
    );
    return new Response(new Uint8Array(buf), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
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
