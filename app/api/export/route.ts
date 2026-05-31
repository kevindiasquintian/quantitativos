import { NextResponse } from "next/server";
import { PremissasSchema } from "@/lib/premissas";
import { buildWorkbook } from "@/lib/xlsx";
import type { ExportPayload, ExtractionResult } from "@/lib/types";

export const runtime = "nodejs";

// Recebe o payload completo e devolve a planilha XLSX para download.
export async function POST(req: Request): Promise<Response> {
  let body: {
    projectName?: unknown;
    premissas?: unknown;
    pages?: unknown;
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON invalido." }, { status: 400 });
  }

  if (typeof body.projectName !== "string") {
    return NextResponse.json(
      { error: "projectName ausente ou invalido." },
      { status: 400 }
    );
  }
  if (!Array.isArray(body.pages)) {
    return NextResponse.json(
      { error: "pages ausente ou invalido." },
      { status: 400 }
    );
  }

  let premissas;
  try {
    premissas = PremissasSchema.parse(body.premissas);
  } catch (err) {
    const message = err instanceof Error ? err.message : "premissas invalidas.";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  try {
    const payload: ExportPayload = {
      projectName: body.projectName,
      premissas,
      pages: body.pages as ExtractionResult[],
    };

    const buf = await buildWorkbook(payload);

    const headers = {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="quantitativos.xlsx"',
    };
    return new Response(new Uint8Array(buf), { headers });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro ao gerar a planilha.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
