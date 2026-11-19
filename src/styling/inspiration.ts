// "Armar con mi guardarropa": dada una referencia (lista de prendas detectadas),
// busca en el guardarropa de la persona las prendas más parecidas y arma versiones.
// Nunca inventa prendas: lo que no existe en el guardarropa se informa como faltante.
import { COLORS, NEUTRAL_COLORS, type Category } from "@shared/taxonomy.ts";
import type { InspirationPiece } from "@/lib/inspirationVision";
import { hexToRgb } from "@/lib/image";
import { levelsFor } from "@/lib/garmentDefaults";
import type { Garment } from "@/lib/types";
import { isValidOutfit, sortBySlot } from "./engine";

/** Tipos que cumplen una función parecida (una remera puede reemplazar a una musculosa, etc.). */
const FAMILIES: string[][] = [
  ["remera", "musculosa", "top", "body", "camisa", "blusa"],
  ["sweater", "buzo", "polera", "cárdigan"],
  ["jean", "pantalón", "jogger", "pantalón de vestir", "calza"],
  ["pollera", "short", "bermuda"],
  ["vestido", "mono", "enterito"],
  ["campera", "puffer", "chaleco", "piloto", "trench"],
  ["blazer", "saco", "tapado"],
  ["zapatilla", "borcego", "bota", "botineta"],
  ["zapato", "mocasín", "chatita", "taco"],
  ["sandalia", "chatita"],
  ["cartera", "mochila"],
  ["gorro", "gorra"],
  ["bufanda", "pañuelo"],
];

export const MATCH_THRESHOLD = 0.5; // por debajo, se considera que no hay algo parecido

function typeScore(a: string, b: string): number {
  if (a === b) return 1;
  return FAMILIES.some((f) => f.includes(a) && f.includes(b)) ? 0.65 : 0.25;
}

function colorScore(a: string, b: string): number {
  if (a === b) return 1;
  const ca = COLORS[a as keyof typeof COLORS], cb = COLORS[b as keyof typeof COLORS];
  if (!ca || !cb) return 0.3;
  const [r1, g1, b1] = hexToRgb(ca), [r2, g2, b2] = hexToRgb(cb);
  const dist = Math.hypot(r1 - r2, g1 - g2, b1 - b2) / 441; // 0 (igual) … 1 (opuesto)
  let score = 1 - Math.min(1, dist * 2.6);
  if (NEUTRAL_COLORS.includes(a) && NEUTRAL_COLORS.includes(b)) score = Math.max(score, 0.45);
  return Math.max(0, score);
}

/** 0–1: qué tan parecida es una prenda del guardarropa a la de la referencia. */
export function similarity(piece: InspirationPiece, garment: Garment): number {
  if (garment.category !== piece.category) return 0;
  const type = typeScore(piece.type, garment.type);
  const color = Math.max(colorScore(piece.color, garment.primary_color), ...garment.secondary_colors.map((c) => colorScore(piece.color, c) * 0.8));
  const pattern = piece.pattern === garment.pattern ? 1 : piece.pattern === "liso" || garment.pattern === "liso" ? 0.35 : 0.6;
  const formality = 1 - Math.min(4, Math.abs(levelsFor(piece.type).formality - garment.formality)) / 4;
  return 0.4 * type + 0.38 * color + 0.1 * pattern + 0.12 * formality;
}

export interface PieceMatch {
  piece: InspirationPiece;
  garment: Garment | null; // null: no hay nada parecido en el guardarropa
  score: number;
  closest: Garment | null; // lo más cercano aunque no alcance el umbral
  approx: boolean; // se usó lo más cercano que hay, aunque se parece poco
}

export interface Version {
  items: Garment[];
  matches: PieceMatch[];
  missing: InspirationPiece[];
  similarity: number; // promedio 0–1 de las piezas encontradas
  complete: boolean; // se puede usar como outfit (parte superior + inferior, o vestido)
}

const PER_SLOT = 3;
const MAX_VERSIONS = 12;

/**
 * Arma versiones ordenadas de la más a la menos parecida. `extraScore` (opcional) suma el
 * criterio del motor de estilismo (clima, preferencias, combinación de colores…).
 */
export function buildVersions(pieces: InspirationPiece[], garments: Garment[], extraScore?: (items: Garment[]) => number): Version[] {
  const options = pieces.map((piece) => {
    const ranked = garments
      .map((garment) => ({ garment, score: similarity(piece, garment) }))
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score);
    const good = ranked.filter((r) => r.score >= MATCH_THRESHOLD).slice(0, PER_SLOT);
    // Para las prendas esenciales (superior, inferior, vestido) se usa lo más cercano que haya,
    // marcándolo como aproximado, para no dejar el outfit incompleto.
    const essential = ["top", "bottom", "dress"].includes(piece.category);
    return { piece, ranked, usable: good.length || !essential ? good : ranked.slice(0, 1) };
  });

  // Combinaciones de las mejores candidatas por pieza (una pieza sin candidatas queda como faltante).
  let combos: { garment: Garment | null; score: number; pieceIndex: number }[][] = [[]];
  options.forEach((opt, pieceIndex) => {
    const choices = opt.usable.length ? opt.usable.map((r) => ({ garment: r.garment as Garment | null, score: r.score, pieceIndex })) : [{ garment: null, score: 0, pieceIndex }];
    combos = combos.flatMap((c) => choices.map((choice) => [...c, choice]));
  });

  const versions: Version[] = [];
  const seen = new Set<string>();
  for (const combo of combos) {
    const chosen = combo.filter((c) => c.garment);
    const ids = chosen.map((c) => c.garment!.id);
    if (new Set(ids).size !== ids.length) continue; // la misma prenda no puede cubrir dos lugares
    const key = [...ids].sort().join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    const items = sortBySlot(chosen.map((c) => c.garment!));
    const matches: PieceMatch[] = options.map((opt, i) => {
      const hit = combo.find((c) => c.pieceIndex === i);
      return { piece: opt.piece, garment: hit?.garment ?? null, score: hit?.score ?? 0, closest: opt.ranked[0]?.garment ?? null, approx: Boolean(hit?.garment && hit.score < MATCH_THRESHOLD) };
    });
    const found = matches.filter((m) => m.garment);
    versions.push({
      items, matches,
      missing: matches.filter((m) => !m.garment).map((m) => m.piece),
      similarity: found.length ? found.reduce((s, m) => s + m.score, 0) / found.length : 0,
      complete: items.length > 0 && isValidOutfit(items),
    });
  }

  const rank = (v: Version) => {
    const coverage = v.matches.length ? v.matches.filter((m) => m.garment).length / v.matches.length : 0;
    const base = 0.6 * v.similarity + 0.4 * coverage;
    return (v.complete ? 1 : 0) + base * 0.75 + (extraScore && v.items.length ? extraScore(v.items) * 0.25 : 0);
  };
  return versions.sort((a, b) => rank(b) - rank(a)).slice(0, MAX_VERSIONS);
}

/** "camisa celeste" o, si es estampada, "camisa celeste · rayado". */
export function pieceLabel(piece: Pick<InspirationPiece, "type" | "color"> & { pattern?: string }): string {
  const base = `${piece.type} ${piece.color}`;
  return piece.pattern && piece.pattern !== "liso" ? `${base} · ${piece.pattern}` : base;
}

export function categoryOrder(c: Category): number {
  return ["outerwear", "top", "dress", "bottom", "shoes", "accessory"].indexOf(c);
}
