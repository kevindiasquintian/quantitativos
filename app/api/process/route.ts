import { NextResponse } from "next/server";
import { readDoc } from "@/lib/store";
import { getPagesMeta, extractPage } from "@/lib/pdf";
import { quantifyAuto, scaleToMetersPerUnit } from "@/lib/quantify";
import type { ExtractionResult } from "@/lib/types";

export const runtime = "nodejs";

// Processa TODAS as paginas do PDF automaticamente, recebendo apenas a escala.
// Corpo: { docId: string, scaleDenominator: number }  // ex.: 50 para 1:50
export async function POST(req: Request): Promise<Response> {
  let body: { docId?: unknown; scaleDenominator?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON invalido." }, { status: 400 });
  }

  const { docId, scaleDenominator } = body;
  if (typeof docId !== "string" || docId.length === 0) {
    return NextResponse.json(
      { error: "docId ausente ou invalido." },
      { status: 400 },
    );
  }
  if (
    typeof scaleDenominator !== "number" ||
    !Number.isFinite(scaleDenominator) ||
    scaleDenominator <= 0
  ) {
    return NextResponse.json(
      { error: "Escala invalida. Informe o denominador (ex.: 50 para 1:50)." },
      { status: 400 },
    );
  }

  try {
    const data = await readDoc(docId);
    const metersPerUnit = scaleToMetersPerUnit(scaleDenominator);
    // O pdf.js consome (detacha) o Uint8Array em cada getDocument; por isso
    // passamos uma CÓPIA fresca a cada leitura, senão a 2ª leitura vem vazia.
    const metas = await getPagesMeta(new Uint8Array(data));

    const pages: ExtractionResult[] = [];
    for (const meta of metas) {
      try {
        const { texts, segments } = await extractPage(
          new Uint8Array(data),
          meta.index,
        );
        pages.push(quantifyAuto({ texts, segments, meta, metersPerUnit }));
      } catch {
        // Pagina problematica nao derruba o lote: registra resultado vazio.
        pages.push({
          pageIndex: meta.index,
          rooms: [],
          walls: { totalLengthM: 0, segments: [] },
          counts: [],
          finishes: [],
        });
      }
    }

    return NextResponse.json({ pages });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Erro ao processar o documento.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
