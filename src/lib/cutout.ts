// "Fondo limpio": recorta la prenda, la centra y la apoya sobre fondo blanco.
// Usa un modelo de segmentación (RMBG-1.4, versión cuantizada de ~44 MB) que corre
// dentro del navegador: gratis, sin API key y sin que la foto salga del dispositivo.
// No redibuja ni modifica la prenda: solo quita lo que la rodea.
// Nota de licencia: RMBG-1.4 es de uso no comercial; antes de cobrar por la app
// hay que reemplazarlo por un modelo con licencia comercial (p. ej. BiRefNet).
import { loadTransformers, progressTracker } from "./transformers";

const MODEL = "briaai/RMBG-1.4";
const OUT_W = 800;
const OUT_H = 1000; // 4:5, igual que las tarjetas de la app
const FILL = 0.86; // porcentaje del lienzo que ocupa la prenda
const MIN_FOREGROUND = 0.02;
const MAX_FOREGROUND = 0.97;

type Loaded = {
  model: (inputs: Record<string, unknown>) => Promise<Record<string, any>>;
  processor: (image: unknown) => Promise<{ pixel_values: unknown }>;
  RawImage: typeof import("@huggingface/transformers").RawImage;
};
let loading: Promise<Loaded> | null = null;

export function loadCutoutModel(onProgress?: (percent: number) => void): Promise<Loaded> {
  loading ??= (async () => {
    const { AutoModel, AutoProcessor, RawImage } = await loadTransformers();
    const progress_callback = progressTracker(onProgress);
    const [model, processor] = await Promise.all([
      AutoModel.from_pretrained(MODEL, { dtype: "q8", progress_callback }),
      AutoProcessor.from_pretrained(MODEL, { progress_callback }),
    ]);
    return { model: model as unknown as Loaded["model"], processor: processor as unknown as Loaded["processor"], RawImage };
  })().catch((error) => {
    loading = null;
    throw error;
  });
  return loading;
}

export class CutoutError extends Error {}

/** Devuelve la prenda centrada sobre fondo blanco (JPEG 800×1000). */
export async function cleanGarmentPhoto(file: Blob, onProgress?: (percent: number) => void): Promise<Blob> {
  const { model, processor, RawImage } = await loadCutoutModel(onProgress);

  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  try {
    const scale = Math.min(1, 1024 / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const source = document.createElement("canvas");
    source.width = w; source.height = h;
    const sctx = source.getContext("2d", { willReadFrequently: true })!;
    sctx.drawImage(bitmap, 0, 0, w, h);
    const pixels = sctx.getImageData(0, 0, w, h);

    // Máscara de primer plano (0–255) a la resolución de la foto.
    const input = new RawImage(new Uint8ClampedArray(pixels.data), w, h, 4).rgb();
    const { pixel_values } = await processor(input);
    const output = await model({ input: pixel_values });
    const tensor = Object.values(output)[0] as { [i: number]: any };
    const mask = await RawImage.fromTensor(tensor[0].mul(255).to("uint8")).resize(w, h);

    // Caja contenedora de la prenda y proporción de píxeles de primer plano.
    let minX = w, minY = h, maxX = -1, maxY = -1, on = 0;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (mask.data[y * w + x] > 128) {
          on++;
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    const share = on / (w * h);
    if (share < MIN_FOREGROUND || share > MAX_FOREGROUND) {
      throw new CutoutError("No pudimos separar la prenda del fondo en esta foto.");
    }

    // Aplica la máscara como transparencia (bordes suaves) y recorta.
    for (let i = 0; i < w * h; i++) pixels.data[i * 4 + 3] = mask.data[i];
    sctx.putImageData(pixels, 0, 0);
    const bw = maxX - minX + 1, bh = maxY - minY + 1;
    const fit = Math.min((OUT_W * FILL) / bw, (OUT_H * FILL) / bh, 2.5);
    const out = document.createElement("canvas");
    out.width = OUT_W; out.height = OUT_H;
    const octx = out.getContext("2d")!;
    octx.fillStyle = "#FFFFFF";
    octx.fillRect(0, 0, OUT_W, OUT_H);
    octx.imageSmoothingQuality = "high";
    const dw = bw * fit, dh = bh * fit;
    octx.drawImage(source, minX, minY, bw, bh, (OUT_W - dw) / 2, (OUT_H - dh) / 2, dw, dh);

    return await new Promise<Blob>((resolve, reject) =>
      out.toBlob((b) => (b ? resolve(b) : reject(new CutoutError("No se pudo generar la imagen."))), "image/jpeg", 0.92),
    );
  } finally {
    bitmap.close();
  }
}
