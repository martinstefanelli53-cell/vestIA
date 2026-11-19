// Procesamiento de imágenes en el navegador: miniaturas, versión liviana para
// la IA y análisis de color. La fotografía original nunca se modifica.
import { COLOR_NAMES, COLORS } from "@shared/taxonomy.ts";

export const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
export const MAX_IMAGE_BYTES = 15 * 1024 * 1024;

export function validateImage(file: File): string | null {
  if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) return "Formato no compatible. Usá JPG, PNG o WebP.";
  if (file.size > MAX_IMAGE_BYTES) return "La imagen supera los 15 MB.";
  return null;
}

async function loadBitmap(file: Blob): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new Error("No se pudo leer la imagen.");
  }
}

function draw(bitmap: ImageBitmap, maxSide: number): HTMLCanvasElement {
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return canvas;
}

function toBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("No se pudo procesar la imagen."))), "image/jpeg", quality),
  );
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = () => reject(new Error("No se pudo leer la imagen."));
    reader.readAsDataURL(blob);
  });
}

export interface PreparedImage {
  thumb: Blob; // miniatura para la grilla
  aiBase64: string; // versión reducida que se envía al servicio de IA
  colors: { primary: string; secondary: string[] }; // análisis local de color
}

export async function prepareImage(file: File): Promise<PreparedImage> {
  const bitmap = await loadBitmap(file);
  try {
    const thumb = await toBlob(draw(bitmap, 480), 0.82);
    const aiBase64 = await blobToBase64(await toBlob(draw(bitmap, 1024), 0.85));
    const colors = analyzeColors(draw(bitmap, 72));
    return { thumb, aiBase64, colors };
  } finally {
    bitmap.close();
  }
}

// ───────────────────────── Análisis de color ─────────────────────────
type RGB = [number, number, number];
const PALETTE: { name: string; rgb: RGB }[] = COLOR_NAMES.map((name) => ({ name, rgb: hexToRgb(COLORS[name]) }));

export function hexToRgb(hex: string): RGB {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Distancia perceptual aproximada ("redmean"), suficiente para nombrar colores. */
function distance(a: RGB, b: RGB): number {
  const rm = (a[0] + b[0]) / 2;
  const dr = a[0] - b[0], dg = a[1] - b[1], db = a[2] - b[2];
  return Math.sqrt((2 + rm / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rm) / 256) * db * db);
}

function rgbToLab([r, g, b]: RGB): [number, number, number] {
  const lin = (v: number) => { const c = v / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  const [lr, lg, lb] = [lin(r), lin(g), lin(b)];
  const x = (0.4124 * lr + 0.3576 * lg + 0.1805 * lb) / 0.95047;
  const y = 0.2126 * lr + 0.7152 * lg + 0.0722 * lb;
  const z = (0.0193 * lr + 0.1192 * lg + 0.9505 * lb) / 1.08883;
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))];
}
const PALETTE_LAB = PALETTE.map((p) => ({ name: p.name, lab: rgbToLab(p.rgb) }));

function hsl([r, g, b]: RGB): [number, number, number] {
  const [R, G, B] = [r / 255, g / 255, b / 255];
  const max = Math.max(R, G, B), min = Math.min(R, G, B), l = (max + min) / 2, d = max - min;
  if (d === 0) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1));
  const h = max === R ? ((G - B) / d) % 6 : max === G ? (B - R) / d + 2 : (R - G) / d + 4;
  return [(h * 60 + 360) % 360, s, l];
}

/**
 * Nombre de color de la paleta de VESTIA. Los neutros (negro, gris, blanco) se deciden
 * por luminosidad, porque con poca saturación el tono de la luz engaña (un negro con
 * sombra azulada no es "azul marino"); el resto, por distancia en espacio Lab.
 */
export function nearestColorName(rgb: RGB): string {
  const [h, s, l] = hsl(rgb);
  if (l < 0.1) return "negro";
  if (s < 0.14 || l > 0.95) {
    if (l < 0.24) return "negro";
    if (l > 0.88) return "blanco";
    return "gris";
  }
  if (l < 0.17 && s < 0.5) return "negro";
  if (l > 0.82 && s < 0.5 && h >= 20 && h <= 65) return "crema";
  const lab = rgbToLab(rgb);
  let best = PALETTE_LAB[0];
  let bestD = Infinity;
  for (const entry of PALETTE_LAB) {
    const d = (lab[0] - entry.lab[0]) ** 2 + (lab[1] - entry.lab[1]) ** 2 + (lab[2] - entry.lab[2]) ** 2;
    if (d < bestD) { best = entry; bestD = d; }
  }
  return best.name;
}

/**
 * Estima el color predominante de la prenda: descarta los píxeles parecidos al
 * fondo (estimado en las esquinas), pondera más el centro y agrupa por el
 * color con nombre más cercano de la paleta de VESTIA.
 */
export function analyzeColors(canvas: HTMLCanvasElement): { primary: string; secondary: string[] } {
  const { width: w, height: h } = canvas;
  const data = canvas.getContext("2d")!.getImageData(0, 0, w, h).data;
  const px = (x: number, y: number): RGB => {
    const i = (y * w + x) * 4;
    return [data[i], data[i + 1], data[i + 2]];
  };
  const corners = [px(1, 1), px(w - 2, 1), px(1, h - 2), px(w - 2, h - 2)];
  const bg: RGB = [0, 1, 2].map((c) => corners.reduce((s, p) => s + p[c], 0) / 4) as RGB;
  const uniformBg = corners.every((c) => distance(c, bg) < 60);

  const counts = new Map<string, number>();
  let total = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = px(x, y);
      if (uniformBg && distance(p, bg) < 70) continue;
      const cx = (x / w - 0.5) * 2, cy = (y / h - 0.5) * 2;
      const weight = 1.6 - Math.min(1, Math.hypot(cx, cy));
      const name = nearestColorName(p);
      counts.set(name, (counts.get(name) ?? 0) + weight);
      total += weight;
    }
  }
  if (total === 0) return { primary: nearestColorName(bg), secondary: [] };
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  return {
    primary: ranked[0][0],
    secondary: ranked.slice(1).filter(([, n]) => n / total >= 0.14).slice(0, 2).map(([name]) => name),
  };
}
