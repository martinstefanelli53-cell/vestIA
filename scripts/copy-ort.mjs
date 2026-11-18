// Copia el runtime WebAssembly de ONNX a public/ort para servirlo desde el propio
// sitio (sin depender de un CDN externo en tiempo de ejecución).
import { copyFileSync, mkdirSync, existsSync } from "node:fs";
const from = "node_modules/onnxruntime-web/dist/";
const to = "public/ort/";
mkdirSync(to, { recursive: true });
for (const f of ["ort-wasm-simd-threaded.asyncify.mjs", "ort-wasm-simd-threaded.asyncify.wasm"]) {
  if (!existsSync(from + f)) throw new Error(`Falta ${from + f}: ejecutá npm install`);
  copyFileSync(from + f, to + f);
}
