import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { saveDoc } from "@/lib/store";
import { getPagesMeta } from "@/lib/pdf";
import type { UploadResult } from "@/lib/types";

export const runtime = "nodejs";

// Recebe o PDF via multipart/form-data, persiste e devolve metadados das paginas.
export async function POST(req: Request): Promise<Response> {
  let file: File | null = null;

  try {
    const form = await req.formData();
    const field = form.get("file");
    if (!(field instanceof File)) {
      return NextResponse.json(
        { error: 'Campo "file" ausente ou invalido.' },
        { status: 400 }
      );
    }
    file = field;
  } catch {
    return NextResponse.json(
      { error: "Corpo multipart/form-data invalido." },
      { status: 400 }
    );
  }

  // Valida que o arquivo e um PDF (pelo mime ou pela extensao).
  const isPdf =
    file.type === "application/pdf" ||
    file.name.toLowerCase().endsWith(".pdf");
  if (!isPdf) {
    return NextResponse.json(
      { error: "O arquivo enviado nao e um PDF." },
      { status: 400 }
    );
  }

  try {
    const docId = randomUUID();
    const data = new Uint8Array(await file.arrayBuffer());

    await saveDoc(docId, file.name, data);
    const pages = await getPagesMeta(data);

    const result: UploadResult = {
      docId,
      fileName: file.name,
      pages,
    };
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro ao processar o PDF.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
