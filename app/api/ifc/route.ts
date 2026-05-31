import { NextResponse } from "next/server";
import { parseIfc } from "@/lib/ifc";
import { buildBudget } from "@/lib/budget";

export const runtime = "nodejs";
export const maxDuration = 120;

// Recebe um arquivo IFC (multipart, campo "file"), extrai os quantitativos e
// devolve itens de orçamento + detalhamento + resumo por tipo.
export async function POST(req: Request): Promise<Response> {
  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Arquivo ausente." }, { status: 400 });
    }
    const text = await file.text();
    const { elements, schema } = parseIfc(text);
    const budget = buildBudget(elements);
    return NextResponse.json({
      fileName: file.name,
      schema,
      totalElements: elements.length,
      ...budget,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro ao ler o IFC.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
