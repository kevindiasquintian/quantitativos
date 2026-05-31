import { NextResponse } from "next/server";
import { PremissasSchema } from "@/lib/premissas";
import { readDoc } from "@/lib/store";
import { extractPage } from "@/lib/pdf";
import { quantify } from "@/lib/quantify";
import type { Calibration, ExtractionResult } from "@/lib/types";

export const runtime = "nodejs";

// Le uma pagina do PDF persistido e devolve a extracao quantitativa.
export async function POST(req: Request): Promise<Response> {
  let body: {
    docId?: unknown;
    pageIndex?: unknown;
    calibration?: unknown;
    premissas?: unknown;
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON invalido." }, { status: 400 });
  }

  // Validacao dos campos obrigatorios do corpo.
  const { docId, pageIndex, calibration } = body;
  if (typeof docId !== "string" || docId.length === 0) {
    return NextResponse.json(
      { error: "docId ausente ou invalido." },
      { status: 400 }
    );
  }
  if (typeof pageIndex !== "number" || !Number.isInteger(pageIndex) || pageIndex < 0) {
    return NextResponse.json(
      { error: "pageIndex ausente ou invalido." },
      { status: 400 }
    );
  }
  if (
    !calibration ||
    typeof calibration !== "object" ||
    typeof (calibration as Calibration).metersPerUnit !== "number"
  ) {
    return NextResponse.json(
      { error: "calibration ausente ou invalida." },
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
    const data = await readDoc(docId);
    const { meta, texts, segments } = await extractPage(data, pageIndex);

    const result: ExtractionResult = quantify({
      texts,
      segments,
      meta,
      calibration: calibration as Calibration,
      premissas,
    });

    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro ao extrair a pagina.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
