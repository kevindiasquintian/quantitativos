"use client";

// ─────────────────────────────────────────────────────────────────────────────
// Visualizador IFC 3D (@thatopen/components, sobre Three.js).
// Carrega o modelo e permite DESTACAR objetos por expressID (localId), usados
// para destacar os elementos que compõem um item do orçamento.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useRef, useState } from "react";

interface Props {
  bytes: Uint8Array | null;
  /** expressIDs (#N do IFC) a destacar no modelo. */
  highlightIds?: number[];
}

// material de destaque (laranja)
const HL_MATERIAL = {
  color: { r: 1, g: 0.45, b: 0 },
  opacity: 1,
  transparent: false,
  renderedFaces: 0,
} as const;

export default function IfcViewer({ bytes, highlightIds }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);

  // refs para acesso fora do effect de carga
  const modelRef = useRef<any>(null);
  const fragmentsRef = useRef<any>(null);
  const worldRef = useRef<any>(null);
  const threeRef = useRef<any>(null);
  const readyRef = useRef(false);

  // ── Carrega o modelo quando os bytes mudam ──────────────────────────────────
  useEffect(() => {
    if (!bytes || !containerRef.current) return;
    const container = containerRef.current;
    let disposed = false;
    const cleanup: Array<() => void> = [];

    (async () => {
      setErro(null);
      setCarregando(true);
      readyRef.current = false;
      try {
        const OBC = await import("@thatopen/components");
        const THREE = await import("three");
        threeRef.current = THREE;

        const components = new OBC.Components();
        const worlds = components.get(OBC.Worlds);
        const world = worlds.create<
          InstanceType<typeof OBC.SimpleScene>,
          InstanceType<typeof OBC.SimpleCamera>,
          InstanceType<typeof OBC.SimpleRenderer>
        >();
        world.scene = new OBC.SimpleScene(components);
        world.renderer = new OBC.SimpleRenderer(components, container);
        world.camera = new OBC.SimpleCamera(components);
        components.init();
        world.scene.setup();
        world.scene.three.background = null;
        worldRef.current = world;

        const grids = components.get(OBC.Grids);
        grids.create(world);

        const fragments = components.get(OBC.FragmentsManager);
        fragmentsRef.current = fragments;
        const workerResp = await fetch(
          "https://thatopen.github.io/engine_fragment/resources/worker.mjs",
        );
        const workerBlob = await workerResp.blob();
        const workerUrl = URL.createObjectURL(
          new File([workerBlob], "worker.mjs", { type: "text/javascript" }),
        );
        fragments.init(workerUrl);

        world.camera.controls.addEventListener("rest", () =>
          fragments.core.update(true),
        );
        fragments.list.onItemSet.add(({ value: model }: any) => {
          model.useCamera(world.camera.three);
          world.scene.three.add(model.object);
          fragments.core.update(true);
        });

        const ifcLoader = components.get(OBC.IfcLoader);
        await ifcLoader.setup({
          autoSetWasm: false,
          wasm: { path: "/", absolute: true },
        });

        const model = await ifcLoader.load(bytes, false, "modelo");
        if (disposed) {
          components.dispose();
          return;
        }
        modelRef.current = model;
        readyRef.current = true;

        try {
          const box = new THREE.Box3().setFromObject(model.object);
          const sphere = box.getBoundingSphere(new THREE.Sphere());
          if (sphere.radius > 0 && world.camera.controls)
            await world.camera.controls.fitToSphere(sphere, true);
        } catch {
          /* ignora */
        }

        // aplica highlight pendente (se já havia seleção)
        await applyHighlight();

        cleanup.push(() => {
          URL.revokeObjectURL(workerUrl);
          components.dispose();
          modelRef.current = null;
          fragmentsRef.current = null;
          worldRef.current = null;
          readyRef.current = false;
        });
      } catch (e) {
        if (!disposed)
          setErro(
            "Falha ao carregar o modelo 3D: " +
              (e instanceof Error ? e.message : String(e)),
          );
      } finally {
        if (!disposed) setCarregando(false);
      }
    })();

    return () => {
      disposed = true;
      cleanup.forEach((fn) => {
        try {
          fn();
        } catch {
          /* ignore */
        }
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bytes]);

  // ── Aplica o destaque quando highlightIds muda ──────────────────────────────
  async function applyHighlight() {
    const model = modelRef.current;
    const fragments = fragmentsRef.current;
    const world = worldRef.current;
    const THREE = threeRef.current;
    if (!model || !fragments || !readyRef.current) return;
    try {
      // limpa destaque anterior
      await model.resetHighlight();
      const ids = (highlightIds ?? []).filter((n) => Number.isFinite(n));
      if (ids.length > 0) {
        await model.highlight(ids, HL_MATERIAL);
        // tenta enquadrar nos itens destacados
        try {
          const boxes = await model.getBoxes(ids);
          if (boxes && boxes.length && world && THREE) {
            const box = new THREE.Box3();
            for (const b of boxes) box.union(b);
            const sphere = box.getBoundingSphere(new THREE.Sphere());
            if (sphere.radius > 0)
              await world.camera.controls.fitToSphere(sphere, true);
          }
        } catch {
          /* fit opcional */
        }
      }
      await fragments.core.update(true);
    } catch (e) {
      // não derruba a UI por falha de destaque
      console.warn("highlight falhou", e);
    }
  }

  useEffect(() => {
    void applyHighlight();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highlightIds]);

  return (
    <div className="relative h-[420px] w-full overflow-hidden rounded border border-slate-200 bg-slate-50">
      <div ref={containerRef} className="h-full w-full" />
      {carregando && (
        <div className="absolute left-2 top-2 rounded bg-slate-800/80 px-2 py-1 text-xs text-white">
          Carregando modelo 3D…
        </div>
      )}
      {erro && (
        <div className="absolute inset-x-2 top-2 rounded bg-red-100 px-3 py-2 text-xs text-red-700">
          {erro}
        </div>
      )}
    </div>
  );
}
