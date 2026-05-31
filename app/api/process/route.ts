import { NextResponse } from "next/server";
import { readDoc } from "@/lib/store";
import { getPagesMeta, extractPage } from "@/lib/pdf";
import { quantifyAuto, scaleToMetersPerUnit } from "@/lib/quantify";
import type { ExtractionResult } from "@/lib/types";

export const runtime = "nodejs";

// Processa paginas do PDF automaticamente, recebendo a escala.
// Corpo: { docId, metersPerUnit?, scaleDenominator?, pageIndices? }
//  - metersPerUnit: fator direto (ex.: vindo da calibracao desenhada). Tem prioridade.
//  - scaleDenominator: alternativa por escala nominal 1:N (ex.: 50 para 1:50).
//  - pageIndices: paginas (0-based) a quantificar. Ausente/vazio = todas.
export async function POST(req: Request): Promise<Response> {
  let body: {
    docId?: unknown;
    metersPerUnit?: unknown;
    scaleDenominator?: unknown;
    pageIndices?: unknown;
  };
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

  // Resolve metros por unidade: direto, ou derivado do denominador 1:N.
  let metersPerUnit: number;
  if (
    typeof body.metersPerUnit === "number" &&
    Number.isFinite(body.metersPerUnit) &&
    body.metersPerUnit > 0
  ) {
    metersPerUnit = body.metersPerUnit;
  } else if (
    typeof scaleDenominator === "number" &&
    Number.isFinite(scaleDenominator) &&
    scaleDenominator > 0
  ) {
    metersPerUnit = scaleToMetersPerUnit(scaleDenominator);
  } else {
    return NextResponse.json(
      {
        error:
          "Escala invalida. Informe metersPerUnit (>0) ou scaleDenominator (ex.: 50).",
      },
      { status: 400 },
    );
  }

  try {
    const data = await readDoc(docId);
    // O pdf.js consome (detacha) o Uint8Array em cada getDocument; por isso
    // passamos uma CÓPIA fresca a cada leitura, senão a 2ª leitura vem vazia.
    const allMetas = await getPagesMeta(new Uint8Array(data));

    // Filtra pelas paginas escolhidas (se houver lista valida); senao, todas.
    let metas = allMetas;
    if (Array.isArray(body.pageIndices) && body.pageIndices.length > 0) {
      const wanted = new Set(
        body.pageIndices.filter(
          (n): n is number => typeof n === "number" && Number.isInteger(n),
        ),
      );
      const filtered = allMetas.filter((m) => wanted.has(m.index));
      if (filtered.length > 0) metas = filtered;
    }

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
