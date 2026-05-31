import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// ─────────────────────────────────────────────────────────────────────────────
// Armazenamento temporário de PDFs enviados, em disco (os.tmpdir).
// Suficiente para uso local/MVP — em produção trocar por storage real.
// ─────────────────────────────────────────────────────────────────────────────

const ROOT = join(tmpdir(), "quantitativos");

function paths(docId: string) {
  // sanitiza para evitar path traversal
  const safe = docId.replace(/[^a-zA-Z0-9_-]/g, "");
  return {
    pdf: join(ROOT, `${safe}.pdf`),
    meta: join(ROOT, `${safe}.json`),
  };
}

export async function saveDoc(
  docId: string,
  fileName: string,
  data: Uint8Array,
): Promise<void> {
  await mkdir(ROOT, { recursive: true });
  const p = paths(docId);
  await writeFile(p.pdf, data);
  await writeFile(p.meta, JSON.stringify({ fileName }), "utf8");
}

export async function readDoc(docId: string): Promise<Uint8Array> {
  const p = paths(docId);
  if (!existsSync(p.pdf)) {
    throw new Error(`Documento não encontrado: ${docId}`);
  }
  const buf = await readFile(p.pdf);
  return new Uint8Array(buf);
}

export async function readDocFileName(docId: string): Promise<string> {
  const p = paths(docId);
  if (!existsSync(p.meta)) return "planta.pdf";
  try {
    const raw = await readFile(p.meta, "utf8");
    return (JSON.parse(raw).fileName as string) || "planta.pdf";
  } catch {
    return "planta.pdf";
  }
}
