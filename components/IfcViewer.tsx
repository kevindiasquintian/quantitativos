"use client";

// ─────────────────────────────────────────────────────────────────────────────
// Visualizador IFC 3D usando @thatopen/components (open-source, sucessor do
// IFC.js, sobre Three.js). Carrega o arquivo IFC em bytes e renderiza o modelo.
// Importado via next/dynamic com ssr:false (usa window/WebGL).
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useRef, useState } from "react";

interface Props {
  bytes: Uint8Array | null;
}

export default function IfcViewer({ bytes }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);

  useEffect(() => {
    if (!bytes || !containerRef.current) return;
    const container = containerRef.current;
    let disposed = false;
    // guarda para limpeza
    const cleanup: Array<() => void> = [];

    (async () => {
      setErro(null);
      setCarregando(true);
      try {
        const OBC = await import("@thatopen/components");
        const THREE = await import("three");

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

        const grids = components.get(OBC.Grids);
        grids.create(world);

        // Sistema de fragments (v3): inicializa o worker de geometria.
        const fragments = components.get(OBC.FragmentsManager);
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
        fragments.list.onItemSet.add(({ value: model }) => {
          model.useCamera(world.camera.three);
          world.scene.three.add(model.object);
          fragments.core.update(true);
        });

        const ifcLoader = components.get(OBC.IfcLoader);
        // autoSetWasm:false impede o auto-resolver (que quebra a instanciação);
        // usamos o wasm local (0.0.77) servido de /public.
        await ifcLoader.setup({
          autoSetWasm: false,
          wasm: { path: "/", absolute: true },
        });

        const model = await ifcLoader.load(bytes, false, "modelo");
        if (disposed) {
          components.dispose();
          return;
        }

        // Enquadra a câmera no modelo.
        try {
          const box = new THREE.Box3().setFromObject(model.object);
          const sphere = box.getBoundingSphere(new THREE.Sphere());
          if (sphere.radius > 0 && world.camera.controls) {
            await world.camera.controls.fitToSphere(sphere, true);
          }
        } catch {
          /* ignora falha de enquadramento */
        }

        cleanup.push(() => {
          URL.revokeObjectURL(workerUrl);
          components.dispose();
        });
      } catch (e) {
        if (!disposed)
          setErro("Falha ao carregar o modelo 3D: " + (e instanceof Error ? e.message : String(e)));
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
  }, [bytes]);

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
