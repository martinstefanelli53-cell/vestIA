// "Mi inspiración": detecta las prendas de una foto de referencia, todo en el
// navegador (gratis, sin API key, la foto no sale del dispositivo).
//  1. Un modelo de segmentación de ropa separa parte superior, inferior, vestido,
//     calzado y accesorios.
//  2. De cada zona se obtiene el color real (por píxeles) y, con CLIP, el tipo y el estampado.
import { TYPES_BY_CATEGORY, type Category } from "@shared/taxonomy.ts";
import { analyzeGarmentLocally, classifyPattern, classifyTypeAmong } from "./localVision";
import { nearestColorName } from "./image";
import { loadTransformers, progressTracker } from "./transformers";

export interface InspirationPiece {
  category: Category;
  type: string;
  color: string;
  secondary: string[];
  pattern: string;
}

const MODEL = "Xenova/segformer_b2_clothes";
const MAX_SIDE = 768;

type Mask = { data: Uint8Array | Uint8ClampedArray; width: number; height: number };
type Segment = { label: string; mask: Mask };

interface Group {
  id: string;
  category: Category;
  labels: string[];
  types: readonly string[];
  minShare: number; // fracción mínima de la foto para considerarla una prenda
}

const GROUPS: Group[] = [
  { id: "top", category: "top", labels: ["Upper-clothes"], types: [...TYPES_BY_CATEGORY.top.filter((t) => t !== "body"), ...TYPES_BY_CATEGORY.outerwear], minShare: 0.01 },
  { id: "skirt", category: "bottom", labels: ["Skirt"], types: ["pollera"], minShare: 0.008 },
  { id: "pants", category: "bottom", labels: ["Pants"], types: TYPES_BY_CATEGORY.bottom.filter((t) => t !== "pollera"), minShare: 0.01 },
  { id: "dress", category: "dress", labels: ["Dress"], types: TYPES_BY_CATEGORY.dress, minShare: 0.02 },
  { id: "shoes", category: "shoes", labels: ["Left-shoe", "Right-shoe"], types: TYPES_BY_CATEGORY.shoes, minShare: 0.002 },
  { id: "bag", category: "accessory", labels: ["Bag"], types: ["cartera", "mochila"], minShare: 0.004 },
  { id: "hat", category: "accessory", labels: ["Hat"], types: ["gorro", "gorra"], minShare: 0.004 },
  { id: "scarf", category: "accessory", labels: ["Scarf"], types: ["bufanda", "pañuelo"], minShare: 0.004 },
  { id: "glasses", category: "accessory", labels: ["Sunglasses"], types: ["anteojos"], minShare: 0.0015 },
  { id: "belt", category: "accessory", labels: ["Belt"], types: ["cinturón"], minShare: 0.002 },
];

let segmenterPromise: Promise<(img: unknown) => Promise<Segment[]>> | null = null;

function loadSegmenter(onProgress?: (p: number) => void) {
  segmenterPromise ??= (async () => {
    const { pipeline } = await loadTransformers();
    const segmenter = await pipeline("image-segmentation", MODEL, { dtype: "q8", progress_callback: progressTracker(onProgress) });
    return segmenter as unknown as (img: unknown) => Promise<Segment[]>;
  })().catch((error) => {
    segmenterPromise = null;
    throw error;
  });
  return segmenterPromise;
}

export class InspirationError extends Error {}

/** Colores dominantes de los píxeles de una zona (ignora el resto de la foto). */
function regionColors(pixels: Uint8ClampedArray, mask: Uint8Array, stride: number): { primary: string; secondary: string[] } {
  const counts = new Map<string, number>();
  let total = 0;
  for (let i = 0; i < mask.length; i += 2) { // muestreo: alcanza y es más rápido
    if (mask[i] < 128) continue;
    const p = i * stride;
    const name = nearestColorName([pixels[p], pixels[p + 1], pixels[p + 2]]);
    counts.set(name, (counts.get(name) ?? 0) + 1);
    total++;
  }
  if (!total) return { primary: "gris", secondary: [] };
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  return { primary: ranked[0][0], secondary: ranked.slice(1).filter(([, n]) => n / total >= 0.2).slice(0, 2).map(([n]) => n) };
}

/** Recorta la zona sobre fondo blanco para que CLIP mire solo esa prenda. */
async function cropRegion(source: HTMLCanvasElement, mask: Uint8Array, w: number, h: number): Promise<Blob | null> {
  let minX = w, minY = h, maxX = -1, maxY = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (mask[y * w + x] >= 128) { if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
  }
  if (maxX < 0) return null;
  const bw = maxX - minX + 1, bh = maxY - minY + 1;
  const crop = document.createElement("canvas");
  crop.width = bw; crop.height = bh;
  const ctx = crop.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, bw, bh);
  const img = source.getContext("2d", { willReadFrequently: true })!.getImageData(minX, minY, bw, bh);
  for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) {
    if (mask[(minY + y) * w + minX + x] < 128) { const i = (y * bw + x) * 4; img.data[i] = img.data[i + 1] = img.data[i + 2] = 255; }
  }
  ctx.putImageData(img, 0, 0);
  return new Promise((resolve) => crop.toBlob(resolve, "image/jpeg", 0.9));
}

/** Detecta las prendas de una foto de referencia. */
export async function detectPieces(file: Blob, onProgress?: (percent: number) => void): Promise<InspirationPiece[]> {
  const [{ RawImage }, segment] = await Promise.all([loadTransformers(), loadSegmenter(onProgress)]);
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  try {
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale)), h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
    ctx.drawImage(bitmap, 0, 0, w, h);
    const pixels = ctx.getImageData(0, 0, w, h).data;

    const segments = await segment(new RawImage(new Uint8ClampedArray(pixels), w, h, 4).rgb());
    const pieces: InspirationPiece[] = [];

    for (const group of GROUPS) {
      const parts = segments.filter((s) => group.labels.includes(s.label));
      if (!parts.length) continue;
      const merged = new Uint8Array(w * h);
      for (const part of parts) {
        const m = part.mask;
        if (m.width !== w || m.height !== h) continue;
        for (let i = 0; i < merged.length; i++) if (m.data[i] >= 128) merged[i] = 255;
      }
      let area = 0;
      for (let i = 0; i < merged.length; i++) if (merged[i]) area++;
      if (area / (w * h) < group.minShare) continue;

      const crop = await cropRegion(canvas, merged, w, h);
      if (!crop) continue;
      const { type } = await classifyTypeAmong(crop, group.types, onProgress);
      const category: Category = TYPES_BY_CATEGORY.outerwear.includes(type) ? "outerwear" : group.category;
      const colors = regionColors(pixels, merged, 4);
      pieces.push({ category, type, color: colors.primary, secondary: colors.secondary, pattern: await classifyPattern(crop, onProgress) });
    }

    if (pieces.length) return pieces;

    // Sin persona (prenda sola o combinación apoyada): se reconoce la imagen completa.
    const whole = await analyzeGarmentLocally(file, onProgress);
    if (!whole.isGarment) throw new InspirationError("No encontramos prendas en la foto. Probá con una imagen donde se vea el look completo.");
    const colors = regionColors(pixels, new Uint8Array(w * h).fill(255), 4);
    return [{ category: whole.fields.category, type: whole.fields.type, color: colors.primary, secondary: colors.secondary, pattern: whole.fields.pattern }];
  } finally {
    bitmap.close();
  }
}
