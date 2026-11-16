// Teoría de color aplicada al estilismo: neutros, análogos y complementarios.
import { COLORS, NEUTRAL_COLORS, type ColorName } from "@shared/taxonomy.ts";

function hueOfHex(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  if (max === min) return 0;
  const d = max - min;
  let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h *= 60;
  return h < 0 ? h + 360 : h;
}

export const isNeutral = (color: string) => NEUTRAL_COLORS.includes(color);
export const colorHex = (color: string) => COLORS[color as ColorName] ?? "#BDBDBD";

export function hueDistance(a: string, b: string): number {
  const d = Math.abs(hueOfHex(colorHex(a)) - hueOfHex(colorHex(b)));
  return d > 180 ? 360 - d : d;
}

export type PaletteKind = "neutros" | "acento" | "analogos" | "complementarios" | "mixto" | "saturado";

export interface PaletteVerdict {
  kind: PaletteKind;
  score: number;
  accents: string[];
}

/** Evalúa la paleta de un conjunto de colores principales. */
export function judgePalette(colors: string[]): PaletteVerdict {
  const accents = [...new Set(colors.filter((c) => !isNeutral(c)))];
  if (accents.length === 0) return { kind: "neutros", score: 0.86, accents };
  if (accents.length === 1) return { kind: "acento", score: 1, accents };
  if (accents.length === 2) {
    const d = hueDistance(accents[0], accents[1]);
    if (d <= 40) return { kind: "analogos", score: 0.92, accents };
    if (d >= 150) return { kind: "complementarios", score: 0.8, accents };
    return { kind: "mixto", score: 0.5, accents };
  }
  return { kind: "saturado", score: 0.2, accents };
}
