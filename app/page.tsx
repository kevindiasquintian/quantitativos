"use client";

// ─────────────────────────────────────────────────────────────────────────────
// Extrator de quantitativos por IFC + visualizador 3D + planilha orçamentária.
//   1) abre .ifc  → mostra o modelo em 3D e extrai quantitativos
//   2) traduz para itens de orçamento (agente orçamentista) agrupados por etapa
//   3) preços unitários editáveis na web (total e total geral)
//   4) exporta a planilha .xlsx
// ─────────────────────────────────────────────────────────────────────────────

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { sinapiPrice, sinapiRef, type CostSource } from "@/lib/sinapi";

const IfcViewer = dynamic(() => import("@/components/IfcViewer"), { ssr: false });

interface BudgetItem {
  codigo: string;
  etapa: string;
  descricao: string;
  unidade: string;
  quantidade: number;
  criterio: string;
  estimado: boolean;
  sourceIds: number[];
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
  const [bytes, setBytes] = useState<Uint8Array | null>(null);
  const [prices, setPrices] = useState<Record<string, number>>({});
  const [costSource, setCostSource] = useState<CostSource>("SINAPI");

  // Item "sobrescrito": o usuário digitou um preço próprio, sobrepondo o SINAPI.
  const isOverridden = (codigo: string) => prices[codigo] !== undefined;
  // Volta o item à referência SINAPI (remove o preço manual).
  const resetToSinapi = (codigo: string) =>
    setPrices((p) => {
      const { [codigo]: _, ...rest } = p;
      return rest;
    });

  // Preço efetivo: preço manual tem prioridade; senão, no modo SINAPI usa a
  // referência; no modo usuário, fica zero.
  const effPrice = (codigo: string) =>
    isOverridden(codigo)
      ? prices[codigo]
      : costSource === "SINAPI"
        ? sinapiPrice(codigo)
        : 0;
  const [erro, setErro] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // item do orçamento atualmente destacado no viewer
  const [highlightCodigo, setHighlightCodigo] = useState<string | null>(null);
  const [highlightIds, setHighlightIds] = useState<number[]>([]);

  async function handleUpload(file: File) {
    setErro(null);
    setBusy(true);
    setResult(null);
    setPrices({});
    setHighlightCodigo(null);
    setHighlightIds([]);
    try {
      const ab = await file.arrayBuffer();
      setBytes(new Uint8Array(ab));

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
      const items = result.items.map((it) => ({ ...it, precoUnitario: effPrice(it.codigo) }));
      const resp = await fetch("/api/ifc/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectName, items, detail: result.detail }),
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

  const fmt = (n: number) => n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const totalGeral = useMemo(
    () => (result ? result.items.reduce((s, it) => s + effPrice(it.codigo) * it.quantidade, 0) : 0),
    [result, prices, costSource],
  );

  // alterna o destaque dos objetos paramétricos de um item no viewer 3D
  function toggleHighlight(it: BudgetItem) {
    if (highlightCodigo === it.codigo) {
      setHighlightCodigo(null);
      setHighlightIds([]);
    } else {
      setHighlightCodigo(it.codigo);
      setHighlightIds(it.sourceIds ?? []);
    }
  }

  // agrupa itens por etapa preservando ordem
  const grupos = useMemo(() => {
    if (!result) return [] as Array<{ etapa: string; itens: BudgetItem[] }>;
    const order: string[] = [];
    const map = new Map<string, BudgetItem[]>();
    for (const it of result.items) {
      if (!map.has(it.etapa)) {
        map.set(it.etapa, []);
        order.push(it.etapa);
      }
      map.get(it.etapa)!.push(it);
    }
    return order.map((etapa) => ({ etapa, itens: map.get(etapa)! }));
  }, [result]);

  return (
    <main className="mx-auto min-h-screen max-w-6xl px-4 py-6">
      <header className="mb-5 flex flex-wrap items-center gap-3">
        <h1 className="flex items-baseline gap-2 text-2xl font-semibold tracking-tight text-slate-800">
          Orçamento Preliminar IFC
          <span className="text-sm font-normal text-slate-400 [font-family:var(--font-signature)]">
            by Kevin Quintian
          </span>
        </h1>
        <div className="flex items-center gap-2">
          <label className="text-sm text-slate-500">Projeto:</label>
          <input
            value={projectName}
            onChange={(e) => setProjectName(e.target.value)}
            className="rounded border border-slate-300 px-2 py-1 text-sm"
          />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm text-slate-500">Fonte de Custos:</label>
          <select
            value={costSource}
            onChange={(e) => setCostSource(e.target.value as CostSource)}
            className="rounded border border-slate-300 px-2 py-1 text-sm"
          >
            <option value="SINAPI">SINAPI</option>
            <option value="USUARIO">Inserido pelo Usuário</option>
          </select>
        </div>
        <label className="ml-auto cursor-pointer rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700">
          {busy ? "Processando…" : "Abrir IFC"}
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
          Exportar Excel
        </button>
      </header>

      {erro && (
        <div className="mb-4 rounded border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">{erro}</div>
      )}

      {/* Visualizador 3D */}
      {bytes && (
        <div className="mb-6">
          <IfcViewer bytes={bytes} highlightIds={highlightIds} />
        </div>
      )}

      {!result && !busy && (
        <p className="text-sm text-slate-500">
          Abra um arquivo <code>.ifc</code> para ver o modelo em 3D e gerar a planilha
          orçamentária. Os preços unitários podem ser preenchidos aqui e exportados em Excel.
        </p>
      )}

      {result && (
        <div className="space-y-8">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-slate-500">
              <b>{result.fileName}</b> · {result.schema} · {result.totalElements} elementos
            </p>
            <p className="text-sm">
              <span className="text-slate-500">Total geral: </span>
              <b className="text-slate-800">R$ {fmt(totalGeral)}</b>
            </p>
          </div>

          {/* Planilha orçamentária */}
          <section>
            <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-500">Planilha orçamentária</h2>
            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <table className="w-full border-collapse text-sm [&_td]:border-r [&_td]:border-slate-100 [&_td:last-child]:border-r-0 [&_th]:border-r [&_th]:border-slate-200 [&_th:last-child]:border-r-0">
                <thead>
                  <tr className="bg-slate-100 text-left text-xs uppercase tracking-wide text-slate-500">
                    <th className="px-3 py-2">Código</th>
                    <th className="px-3 py-2">Serviço</th>
                    <th className="px-3 py-2">Unid.</th>
                    <th className="px-3 py-2 text-right">Quant.</th>
                    <th className="px-3 py-2 text-right">Preço unit. (R$)</th>
                    {costSource === "SINAPI" && (
                      <th className="px-3 py-2">CÓDIGO SINAPI / Descrição</th>
                    )}
                    <th className="px-3 py-2 text-right">Total (R$)</th>
                  </tr>
                </thead>
                <tbody>
                  {grupos.map((g) => (
                    <FragmentEtapa
                      key={g.etapa}
                      etapa={g.etapa}
                      itens={g.itens}
                      prices={prices}
                      setPrices={setPrices}
                      costSource={costSource}
                      effPrice={effPrice}
                      isOverridden={isOverridden}
                      resetToSinapi={resetToSinapi}
                      fmt={fmt}
                      hasViewer={!!bytes}
                      highlightCodigo={highlightCodigo}
                      onToggleHighlight={toggleHighlight}
                    />
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-slate-300 bg-slate-50 font-bold">
                    <td className="px-3 py-2" colSpan={costSource === "SINAPI" ? 6 : 5}>
                      TOTAL GERAL
                    </td>
                    <td className="px-3 py-2 text-right">R$ {fmt(totalGeral)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
            <p className="mt-2 text-xs text-slate-400">
              Itens marcados como <i>(estimado)</i> derivam de premissas (formas, armadura,
              revestimentos) — ajuste conforme o projeto. Preços unitários são opcionais.
            </p>
          </section>

        </div>
      )}
    </main>
  );
}

function FragmentEtapa({
  etapa,
  itens,
  prices,
  setPrices,
  costSource,
  effPrice,
  isOverridden,
  resetToSinapi,
  fmt,
  hasViewer,
  highlightCodigo,
  onToggleHighlight,
}: {
  etapa: string;
  itens: BudgetItem[];
  prices: Record<string, number>;
  setPrices: (fn: (p: Record<string, number>) => Record<string, number>) => void;
  costSource: CostSource;
  effPrice: (codigo: string) => number;
  isOverridden: (codigo: string) => boolean;
  resetToSinapi: (codigo: string) => void;
  fmt: (n: number) => string;
  hasViewer: boolean;
  highlightCodigo: string | null;
  onToggleHighlight: (it: BudgetItem) => void;
}) {
  return (
    <>
      <tr className="bg-slate-200/60">
        <td
          className="!border-r-0 border-y border-slate-200 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-600"
          colSpan={costSource === "SINAPI" ? 7 : 6}
        >
          {etapa}
        </td>
      </tr>
      {itens.map((it) => {
        const pu = effPrice(it.codigo);
        const overridden = isOverridden(it.codigo);
        const sinapiOn = costSource === "SINAPI" && !overridden;
        const ref = sinapiRef(it.codigo);
        const ativo = highlightCodigo === it.codigo;
        const temObjetos = (it.sourceIds?.length ?? 0) > 0;
        return (
          <tr
            key={it.codigo}
            className={"border-b border-slate-100 " + (ativo ? "bg-orange-50" : "hover:bg-slate-50/60")}
          >
            <td className="px-3 py-1.5 text-slate-400">{it.codigo}</td>
            <td className="px-3 py-1.5">
              {it.descricao}
              {it.estimado && <span className="ml-1 text-xs text-amber-600">(estimado)</span>}
              {hasViewer && temObjetos && (
                <button
                  type="button"
                  onClick={() => onToggleHighlight(it)}
                  title="Mostrar no modelo 3D os objetos paramétricos usados neste quantitativo"
                  className={
                    "ml-2 rounded border px-1.5 py-0.5 text-xs " +
                    (ativo
                      ? "border-orange-500 bg-orange-500 text-white"
                      : "border-slate-300 text-slate-600 hover:bg-slate-50")
                  }
                >
                  {ativo ? "● ocultar" : `◆ ver objetos (${it.sourceIds.length})`}
                </button>
              )}
            </td>
            <td className="px-3 py-1.5 text-slate-500">{it.unidade}</td>
            <td className="px-3 py-1.5 text-right">{fmt(it.quantidade)}</td>
            <td className="px-3 py-1.5 text-right">
              <div className="flex items-center justify-end gap-1.5">
                {costSource === "SINAPI" && overridden && (
                  <button
                    type="button"
                    onClick={() => resetToSinapi(it.codigo)}
                    title="Voltar ao preço de referência SINAPI"
                    className="rounded border border-slate-300 px-1.5 py-0.5 text-xs text-slate-600 hover:bg-slate-100"
                  >
                    ↺ SINAPI
                  </button>
                )}
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={sinapiOn ? sinapiPrice(it.codigo) : prices[it.codigo] ?? ""}
                  onChange={(e) =>
                    setPrices((p) => ({ ...p, [it.codigo]: Number(e.target.value) }))
                  }
                  className={
                    "w-24 rounded border px-1.5 py-0.5 text-right " +
                    (sinapiOn
                      ? "border-slate-200 bg-slate-50 text-slate-600"
                      : "border-slate-300")
                  }
                  placeholder="0,00"
                />
              </div>
            </td>
            {costSource === "SINAPI" && (
              <td className="px-3 py-1.5 text-xs text-slate-500">
                {!sinapiOn ? (
                  <span className="text-slate-300">— inserido pelo usuário</span>
                ) : ref ? (
                  <>
                    <span className="font-medium text-slate-600">{ref.sinapi}</span>
                    {" · "}
                    {ref.descricao}
                  </>
                ) : null}
              </td>
            )}
            <td className="px-3 py-1.5 text-right font-medium">{fmt(pu * it.quantidade)}</td>
          </tr>
        );
      })}
    </>
  );
}
