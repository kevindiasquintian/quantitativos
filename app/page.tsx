"use client";

// ─────────────────────────────────────────────────────────────────────────────
// Extrator de quantitativos a partir de IFC (BIM).
//   1) abre um arquivo .ifc
//   2) o servidor lê os elementos e suas quantidades (áreas, comprimentos,
//      volumes) e traduz para linguagem de orçamento
//   3) mostra os itens + resumo por tipo + detalhe
//   4) baixa a planilha .xlsx
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from "react";

interface BudgetItem {
  servico: string;
  unidade: string;
  quantidade: number;
}
interface TypeSummary {
  tipo: string;
  count: number;
  areaM2: number;
  comprimentoM: number;
  volumeM3: number;
}
interface ElementDetail {
  tipo: string;
  nome: string;
  guid: string;
  areaM2: number;
  comprimentoM: number;
  volumeM3: number;
}
interface IfcResult {
  fileName: string;
  schema: string;
  totalElements: number;
  items: BudgetItem[];
  byType: TypeSummary[];
  detail: ElementDetail[];
}

export default function Home() {
  const [projectName, setProjectName] = useState("Projeto");
  const [result, setResult] = useState<IfcResult | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleUpload(file: File) {
    setErro(null);
    setBusy(true);
    setResult(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const resp = await fetch("/api/ifc", { method: "POST", body: fd });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data?.error || "HTTP " + resp.status);
      setResult(data as IfcResult);
      const base = file.name.replace(/\.(ifc|txt)$/i, "");
      if (!projectName || projectName === "Projeto") setProjectName(base || "Projeto");
    } catch (e) {
      setErro("Falha ao ler o IFC: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setBusy(false);
    }
  }

  async function handleExport() {
    if (!result) return;
    setBusy(true);
    setErro(null);
    try {
      const resp = await fetch("/api/ifc/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectName: projectName || "Projeto",
          items: result.items,
          byType: result.byType,
          detail: result.detail,
        }),
      });
      if (!resp.ok) throw new Error("HTTP " + resp.status);
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = (projectName || "Projeto") + ".xlsx";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setErro("Falha ao exportar: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setBusy(false);
    }
  }

  const fmt = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 2 });

  return (
    <main className="mx-auto min-h-screen max-w-5xl px-4 py-6">
      <header className="mb-6 flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-bold text-slate-800">Quantitativos IFC</h1>
        <div className="flex items-center gap-2">
          <label className="text-sm text-slate-500">Projeto:</label>
          <input
            value={projectName}
            onChange={(e) => setProjectName(e.target.value)}
            className="rounded border border-slate-300 px-2 py-1 text-sm"
          />
        </div>
        <label className="ml-auto cursor-pointer rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700">
          {busy ? "Lendo…" : "Abrir IFC"}
          <input
            type="file"
            accept=".ifc,.txt,application/octet-stream"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleUpload(f);
              e.target.value = "";
            }}
          />
        </label>
        <button
          type="button"
          onClick={handleExport}
          disabled={!result || busy}
          className="rounded border border-blue-600 px-3 py-1.5 text-sm font-medium text-blue-700 hover:bg-blue-50 disabled:opacity-40"
        >
          Baixar planilha
        </button>
      </header>

      {erro && (
        <div className="mb-4 rounded border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
          {erro}
        </div>
      )}

      {!result && !busy && (
        <p className="text-sm text-slate-500">
          Abra um arquivo <code>.ifc</code> para extrair os quantitativos. O app lê
          os elementos (paredes, lajes, portas, janelas, cobertura…) e suas
          quantidades e traduz para itens de orçamento.
        </p>
      )}

      {result && (
        <div className="space-y-8">
          <p className="text-sm text-slate-500">
            <b>{result.fileName}</b> · esquema {result.schema} ·{" "}
            {result.totalElements} elementos
          </p>

          {/* Orçamento */}
          <section>
            <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-500">
              Itens de orçamento
            </h2>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-slate-500">
                  <th className="py-1 pr-2">#</th>
                  <th className="py-1 pr-2">Serviço</th>
                  <th className="py-1 pr-2">Unid.</th>
                  <th className="py-1 text-right">Quantidade</th>
                </tr>
              </thead>
              <tbody>
                {result.items.map((it, i) => (
                  <tr key={i} className="border-b border-slate-100">
                    <td className="py-1 pr-2 text-slate-400">{i + 1}</td>
                    <td className="py-1 pr-2">{it.servico}</td>
                    <td className="py-1 pr-2 text-slate-500">{it.unidade}</td>
                    <td className="py-1 text-right font-medium">{fmt(it.quantidade)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          {/* Resumo por tipo */}
          <section>
            <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-500">
              Resumo por tipo
            </h2>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-slate-500">
                  <th className="py-1 pr-2">Tipo</th>
                  <th className="py-1 pr-2 text-right">Qtd.</th>
                  <th className="py-1 pr-2 text-right">Área (m²)</th>
                  <th className="py-1 pr-2 text-right">Comp. (m)</th>
                  <th className="py-1 text-right">Volume (m³)</th>
                </tr>
              </thead>
              <tbody>
                {result.byType.map((t, i) => (
                  <tr key={i} className="border-b border-slate-100">
                    <td className="py-1 pr-2">{t.tipo}</td>
                    <td className="py-1 pr-2 text-right">{t.count}</td>
                    <td className="py-1 pr-2 text-right">{fmt(t.areaM2)}</td>
                    <td className="py-1 pr-2 text-right">{fmt(t.comprimentoM)}</td>
                    <td className="py-1 text-right">{fmt(t.volumeM3)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </div>
      )}
    </main>
  );
}
