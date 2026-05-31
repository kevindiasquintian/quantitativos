"use client";

// ─────────────────────────────────────────────────────────────────────────────
// Painel de edição das Premissas de quantificação.
// Mantém o objeto Premissas no estado do pai via onChange. lossPct é exibido em
// porcentagem (0..100) e convertido para fração (0..1) no objeto Premissas.
// ─────────────────────────────────────────────────────────────────────────────

import type { Premissas } from "@/lib/premissas";

interface PremissasPanelProps {
  premissas: Premissas;
  onChange: (p: Premissas) => void;
}

export default function PremissasPanel({ premissas, onChange }: PremissasPanelProps) {
  // Atualiza parcialmente o objeto de premissas.
  function patch(parcial: Partial<Premissas>) {
    onChange({ ...premissas, ...parcial });
  }

  // ── wallFilter ──────────────────────────────────────────────────────────────
  function setColors(raw: string) {
    const colors = raw
      .split(",")
      .map((c) => c.trim())
      .filter(Boolean);
    patch({ wallFilter: { ...premissas.wallFilter, colors } });
  }

  // ── textCounts ───────────────────────────────────────────────────────────────
  function addTextCount() {
    patch({
      textCounts: [...premissas.textCounts, { name: "", pattern: "" }],
    });
  }
  function updateTextCount(i: number, campo: "name" | "pattern", v: string) {
    const lista = premissas.textCounts.map((t, idx) =>
      idx === i ? { ...t, [campo]: v } : t,
    );
    patch({ textCounts: lista });
  }
  function removeTextCount(i: number) {
    patch({ textCounts: premissas.textCounts.filter((_, idx) => idx !== i) });
  }

  // ── finishes ─────────────────────────────────────────────────────────────────
  function addFinish() {
    patch({
      finishes: [...premissas.finishes, { name: "", lossPct: 0, roomLabels: [] }],
    });
  }
  function updateFinish(
    i: number,
    campo: "name" | "lossPct" | "roomLabels",
    v: string,
  ) {
    const lista = premissas.finishes.map((f, idx) => {
      if (idx !== i) return f;
      if (campo === "lossPct") {
        // input em %, armazenado como fração.
        const pct = parseFloat(v.replace(",", ".")) || 0;
        return { ...f, lossPct: pct / 100 };
      }
      if (campo === "roomLabels") {
        return {
          ...f,
          roomLabels: v
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
        };
      }
      return { ...f, name: v };
    });
    patch({ finishes: lista });
  }
  function removeFinish(i: number) {
    patch({ finishes: premissas.finishes.filter((_, idx) => idx !== i) });
  }

  return (
    <section className="space-y-4 rounded border border-slate-200 bg-white p-3">
      <h2 className="text-sm font-semibold text-slate-700">Premissas</h2>

      {/* areaLabelRegex */}
      <div className="space-y-1">
        <label className="block text-xs font-medium text-slate-600">
          Regex de rótulo de área
        </label>
        <input
          type="text"
          value={premissas.areaLabelRegex}
          onChange={(e) => patch({ areaLabelRegex: e.target.value })}
          className="w-full rounded border border-slate-300 px-2 py-1 font-mono text-xs"
        />
      </div>

      {/* wallFilter */}
      <fieldset className="space-y-2 rounded border border-slate-200 p-2">
        <legend className="px-1 text-xs font-medium text-slate-600">
          Filtro de parede
        </legend>
        <div className="space-y-1">
          <label className="block text-xs text-slate-500">Cores (hex, separadas por vírgula)</label>
          <input
            type="text"
            value={premissas.wallFilter.colors.join(", ")}
            onChange={(e) => setColors(e.target.value)}
            placeholder="#000000, #ff0000"
            className="w-full rounded border border-slate-300 px-2 py-1 font-mono text-xs"
          />
        </div>
        <div className="flex gap-2">
          <div className="flex-1 space-y-1">
            <label className="block text-xs text-slate-500">Espessura mín.</label>
            <input
              type="number"
              step="0.1"
              value={premissas.wallFilter.minWidth}
              onChange={(e) =>
                patch({
                  wallFilter: {
                    ...premissas.wallFilter,
                    minWidth: parseFloat(e.target.value) || 0,
                  },
                })
              }
              className="w-full rounded border border-slate-300 px-2 py-1 text-xs"
            />
          </div>
          <div className="flex-1 space-y-1">
            <label className="block text-xs text-slate-500">Espessura máx. (vazio = sem limite)</label>
            <input
              type="number"
              step="0.1"
              value={premissas.wallFilter.maxWidth ?? ""}
              onChange={(e) => {
                const raw = e.target.value;
                patch({
                  wallFilter: {
                    ...premissas.wallFilter,
                    maxWidth: raw === "" ? null : parseFloat(raw) || null,
                  },
                });
              }}
              className="w-full rounded border border-slate-300 px-2 py-1 text-xs"
            />
          </div>
        </div>
      </fieldset>

      {/* textCounts */}
      <fieldset className="space-y-2 rounded border border-slate-200 p-2">
        <legend className="px-1 text-xs font-medium text-slate-600">
          Contagens por texto (regex)
        </legend>
        {premissas.textCounts.map((t, i) => (
          <div key={i} className="flex items-center gap-2">
            <input
              type="text"
              value={t.name}
              onChange={(e) => updateTextCount(i, "name", e.target.value)}
              placeholder="Nome (ex.: Porta)"
              className="w-1/3 rounded border border-slate-300 px-2 py-1 text-xs"
            />
            <input
              type="text"
              value={t.pattern}
              onChange={(e) => updateTextCount(i, "pattern", e.target.value)}
              placeholder="Padrão (ex.: P\d+)"
              className="flex-1 rounded border border-slate-300 px-2 py-1 font-mono text-xs"
            />
            <button
              type="button"
              onClick={() => removeTextCount(i)}
              className="rounded px-2 py-1 text-xs text-red-600 hover:bg-red-50"
            >
              ✕
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={addTextCount}
          className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-700"
        >
          + Adicionar contagem
        </button>
      </fieldset>

      {/* finishes */}
      <fieldset className="space-y-2 rounded border border-slate-200 p-2">
        <legend className="px-1 text-xs font-medium text-slate-600">
          Revestimentos
        </legend>
        {premissas.finishes.map((f, i) => (
          <div key={i} className="space-y-1 rounded bg-slate-50 p-2">
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={f.name}
                onChange={(e) => updateFinish(i, "name", e.target.value)}
                placeholder="Nome (ex.: Porcelanato)"
                className="flex-1 rounded border border-slate-300 px-2 py-1 text-xs"
              />
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  step="1"
                  value={Math.round(f.lossPct * 100)}
                  onChange={(e) => updateFinish(i, "lossPct", e.target.value)}
                  className="w-16 rounded border border-slate-300 px-2 py-1 text-xs"
                />
                <span className="text-xs text-slate-500">% perda</span>
              </div>
              <button
                type="button"
                onClick={() => removeFinish(i)}
                className="rounded px-2 py-1 text-xs text-red-600 hover:bg-red-50"
              >
                ✕
              </button>
            </div>
            <input
              type="text"
              value={f.roomLabels.join(", ")}
              onChange={(e) => updateFinish(i, "roomLabels", e.target.value)}
              placeholder="Ambientes (vazio = todos), separados por vírgula"
              className="w-full rounded border border-slate-300 px-2 py-1 text-xs"
            />
          </div>
        ))}
        <button
          type="button"
          onClick={addFinish}
          className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-700"
        >
          + Adicionar revestimento
        </button>
      </fieldset>
    </section>
  );
}
