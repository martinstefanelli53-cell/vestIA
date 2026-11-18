// Carga única de Transformers.js (modelos que corren en el navegador).
// Import dinámico: la librería solo se descarga cuando se usa una función de IA local.
let ready: Promise<typeof import("@huggingface/transformers")> | null = null;

export function loadTransformers() {
  ready ??= import("@huggingface/transformers").then((mod) => {
    mod.env.allowLocalModels = false;
    // Runtime WebAssembly servido por el propio sitio (ver scripts/copy-ort.mjs).
    mod.env.backends.onnx.wasm!.wasmPaths = new URL(`${import.meta.env.BASE_URL}ort/`, location.origin).href;
    return mod;
  });
  return ready;
}

type FileProgress = { status: string; file?: string; loaded?: number; total?: number };

/** Agrega los avances de descarga de todos los archivos en un único porcentaje 0–99. */
export function progressTracker(onProgress?: (percent: number) => void) {
  const files = new Map<string, { loaded: number; total: number }>();
  return (p: FileProgress) => {
    if (p.status !== "progress" || !p.file || !p.total) return;
    files.set(p.file, { loaded: p.loaded ?? 0, total: p.total });
    const all = [...files.values()];
    const total = all.reduce((s, f) => s + f.total, 0);
    onProgress?.(Math.min(99, Math.round((all.reduce((s, f) => s + f.loaded, 0) / total) * 100)));
  };
}
