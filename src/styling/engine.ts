// Motor de estilismo de VESTIA.
// Genera outfits con las prendas reales del guardarropa puntuando cada
// combinación con criterios de estilista: clima, ocasión, color, estampados,
// silueta, materiales, preferencias, variedad y aprendizaje de valoraciones.
// Es determinístico (salvo el `rng` inyectable) y no depende de servicios
// externos: funciona como garantía y respaldo del asistente con IA.
import { OCCASIONS, type Category, type StylingWeather } from "@shared/taxonomy.ts";
import type { Garment, Profile } from "@/lib/types";
import { judgePalette, type PaletteVerdict } from "./colors";

export interface Intent {
  occasion: string | null;
  formalityTarget: number | null;
  formalityShift: number; // relativo al outfit actual ("más elegante" = +1)
  warmthShift: number; // "más abrigado" = +1, "más liviano" = -1
  comfort: boolean;
  rain: boolean | null;
  styles: string[];
  colors: string[];
  avoidColors: string[];
  requiredTypes: string[];
  lockedIds: string[];
}

export const EMPTY_INTENT: Intent = {
  occasion: null, formalityTarget: null, formalityShift: 0, warmthShift: 0, comfort: false, rain: null,
  styles: [], colors: [], avoidColors: [], requiredTypes: [], lockedIds: [],
};

export type StyleProfile = Pick<Profile, "styles" | "favorite_colors" | "avoided_colors" | "comfort_priority" | "fit_preference">;

export interface EngineInput {
  garments: Garment[];
  profile: StyleProfile;
  weather: StylingWeather | null;
  season: string;
  intent: Intent;
  /** Outfits recientes, del más nuevo al más viejo. */
  history: { ids: string[]; rating: number | null }[];
  lockedIds?: string[];
  excludeIds?: string[];
  currentIds?: string[];
  rng?: () => number;
}

export type ScorePart = "clima" | "ocasion" | "color" | "estilo" | "estampado" | "silueta" | "material" | "preferencias" | "variedad" | "valoraciones";

export interface OutfitCandidate {
  items: Garment[];
  score: number;
  parts: Record<ScorePart, number>;
  palette: PaletteVerdict;
}

const WEIGHTS: Record<ScorePart, number> = {
  clima: 0.22, ocasion: 0.16, color: 0.16, estilo: 0.1, estampado: 0.07,
  silueta: 0.06, material: 0.04, preferencias: 0.08, variedad: 0.07, valoraciones: 0.04,
};

const SLOT_ORDER: Category[] = ["outerwear", "top", "dress", "bottom", "shoes", "accessory"];
const OPEN_SHOES = ["sandalia", "chatita", "taco"];
const RAIN_SENSITIVE = ["gamuza", "lino", "seda"];
const COMFORT_BY_TYPE: Record<string, number> = {
  zapatilla: 1, chatita: 0.85, mocasín: 0.8, borcego: 0.75, bota: 0.7, botineta: 0.7, sandalia: 0.7, zapato: 0.55, taco: 0.15,
  jogger: 1, calza: 1, buzo: 1, remera: 0.95, sweater: 0.9, "pantalón de vestir": 0.6, blazer: 0.6, body: 0.6,
};
const SEASON_TEMP: Record<string, number> = { verano: 27, primavera: 19, otoño: 17, invierno: 9 };

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));
const mean = (values: number[]) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0);
const by = (items: Garment[], category: Category) => items.find((g) => g.category === category);

export const signature = (items: { id: string; category: Category }[] | Garment[]) =>
  items.filter((g) => g.category !== "accessory").map((g) => g.id).sort().join("|");

export function sortBySlot(items: Garment[]): Garment[] {
  return [...items].sort((a, b) => SLOT_ORDER.indexOf(a.category) - SLOT_ORDER.indexOf(b.category));
}

/** Estructura mínima válida: (superior + inferior) o vestido, sin categorías repetidas. */
export function isValidOutfit(items: Garment[]): boolean {
  const count = (c: Category) => items.filter((g) => g.category === c).length;
  const separates = count("top") === 1 && count("bottom") === 1 && count("dress") === 0;
  const onePiece = count("dress") === 1 && count("bottom") === 0 && count("top") === 0;
  return (separates || onePiece) && count("shoes") <= 1 && count("outerwear") <= 1 && count("accessory") <= 2;
}

// ───────────────────────────── Contexto ─────────────────────────────
interface Ctx {
  input: EngineInput;
  temp: number; // sensación térmica efectiva (incluye "más abrigado / más liviano")
  rain: boolean;
  night: boolean;
  formality: number | null;
  occasionStyles: readonly string[];
  affinity: Map<string, number>;
  recentSignatures: Set<string>;
  recentIds: Set<string>;
  rng: () => number;
}

/** Un pedido explícito ("hace frío", "algo liviano") pesa más que el termómetro. */
export function effectiveTemp(base: number, warmthShift: number): number {
  if (warmthShift > 0) return Math.min(base - 6, 12);
  if (warmthShift < 0) return Math.max(base + 6, 26);
  return base;
}

function buildContext(input: EngineInput): Ctx {
  const { intent, weather, garments } = input;
  const occasion = OCCASIONS.find((o) => o.id === intent.occasion);
  const baseTemp = weather ? weather.feelsLikeC : SEASON_TEMP[input.season] ?? 19;

  let formality = intent.formalityTarget ?? occasion?.formality ?? null;
  if (intent.formalityShift !== 0) {
    const current = garments.filter((g) => input.currentIds?.includes(g.id) && g.category !== "accessory");
    const reference = current.length ? mean(current.map((g) => g.formality)) : formality ?? 2.5;
    formality = clamp(reference + intent.formalityShift * 1.2, 1, 5);
  }

  // Aprendizaje simple: cada prenda acumula el signo de los outfits valorados.
  const affinity = new Map<string, number>();
  for (const past of input.history) {
    if (!past.rating) continue;
    for (const id of past.ids) affinity.set(id, (affinity.get(id) ?? 0) + past.rating / Math.max(2, past.ids.length / 2));
  }

  const known = new Map(garments.map((g) => [g.id, g]));
  const toSignature = (ids: string[]) => signature(ids.map((id) => known.get(id)).filter((g): g is Garment => Boolean(g)));

  return {
    input,
    temp: effectiveTemp(baseTemp, intent.warmthShift),
    rain: intent.rain ?? weather?.rain ?? false,
    night: weather?.isDay === false,
    formality,
    occasionStyles: [...(occasion?.styles ?? []), ...intent.styles],
    affinity,
    recentSignatures: new Set(input.history.slice(0, 12).map((h) => toSignature(h.ids))),
    recentIds: new Set(input.history.slice(0, 2).flatMap((h) => h.ids)),
    rng: input.rng ?? Math.random,
  };
}

// ─────────────────────── Puntaje por prenda (poda) ───────────────────────
function idealWarmth(ctx: Ctx, category: Category): number {
  return category === "outerwear" ? clamp(7 - ctx.temp / 4, 2, 5) : clamp(6 - ctx.temp / 5, 1, 5);
}

function rainPenalty(ctx: Ctx, g: Garment): number {
  if (!ctx.rain) return 0;
  let penalty = 0;
  if (g.category === "shoes" && OPEN_SHOES.includes(g.type)) penalty += 0.7;
  if (g.material && RAIN_SENSITIVE.includes(g.material)) penalty += 0.35;
  if (g.waterproof) penalty -= 0.25;
  return penalty;
}

function comfortOf(g: Garment): number {
  const base = COMFORT_BY_TYPE[g.type] ?? 0.8;
  return clamp(base + (g.fit === "ajustado" ? -0.12 : g.fit === "holgado" ? 0.08 : 0), 0, 1);
}

function unaryScore(ctx: Ctx, g: Garment): number {
  const { profile, intent } = ctx.input;
  let tempFit = 1 - Math.min(1, Math.abs(g.warmth - idealWarmth(ctx, g.category)) / 3);
  if (ctx.temp < 16 && g.warmth === 1) tempFit = 0;
  const formalityFit = ctx.formality === null ? 0.7 : 1 - Math.min(1, Math.abs(g.formality - ctx.formality) / 3);
  const wanted = [...ctx.occasionStyles, ...profile.styles];
  const styleFit = wanted.length === 0 ? 0.6 : g.styles.some((s) => ctx.occasionStyles.includes(s)) ? 1 : g.styles.some((s) => profile.styles.includes(s)) ? 0.7 : 0.25;
  let pref = 0.5;
  if (profile.favorite_colors.includes(g.primary_color) || intent.colors.includes(g.primary_color)) pref += 0.3;
  if (profile.avoided_colors.includes(g.primary_color) || intent.avoidColors.includes(g.primary_color)) pref -= 0.5;
  if (g.is_favorite) pref += 0.1;
  if (g.seasons.length === 0 || g.seasons.includes(ctx.input.season)) pref += 0.1;
  if (intent.comfort || profile.comfort_priority === 3) pref += (comfortOf(g) - 0.6) * 0.6;
  const feedback = 0.5 + 0.5 * Math.tanh((ctx.affinity.get(g.id) ?? 0) / 1.5);
  const required = intent.requiredTypes.includes(g.type) ? 1 : 0;
  return 0.34 * tempFit + 0.24 * formalityFit + 0.18 * styleFit + 0.14 * pref + 0.1 * feedback
    - rainPenalty(ctx, g) * 0.5 + required + ctx.rng() * 0.07;
}

// ─────────────────────── Puntaje por combinación ───────────────────────
function scoreOutfit(ctx: Ctx, items: Garment[]): OutfitCandidate {
  const { profile, intent } = ctx.input;
  const core = items.filter((g) => g.category !== "accessory");
  const outer = by(items, "outerwear");
  const top = by(items, "top");
  const bottom = by(items, "bottom");
  const shoes = by(items, "shoes");
  const base = core.filter((g) => g.category !== "outerwear");

  // Clima: abrigo total respecto de la sensación térmica + reglas de lluvia.
  const effective = mean(base.map((g) => g.warmth)) + (outer ? outer.warmth * 0.35 : 0);
  let clima = 1 - Math.min(1, Math.abs(effective - clamp(6 - ctx.temp / 5, 1.2, 6)) / 2);
  if (ctx.temp < 14 && !outer) clima *= 0.45;
  if (ctx.temp > 24 && outer) clima *= 0.5;
  if (ctx.rain) {
    clima -= mean(core.map((g) => Math.max(0, rainPenalty(ctx, g)))) * 0.9;
    if (outer?.waterproof) clima += 0.12;
    if (!outer && ctx.temp < 24) clima -= 0.1;
  }
  if (!shoes) clima *= 0.85;
  // Con lluvia, calzado abierto: fuerte descuento (se elige solo si no hay alternativa).
  if (ctx.rain && shoes && OPEN_SHOES.includes(shoes.type)) clima *= 0.5;
  // Con frío, nada de calzado abierto ni prendas mínimas (musculosa, short).
  if (ctx.temp < 16 && base.some((g) => g.warmth === 1 || (g.category === "shoes" && OPEN_SHOES.includes(g.type) && g.type !== "taco"))) clima *= 0.4;
  clima = clamp(clima, 0, 1);

  // Ocasión: cercanía al nivel de formalidad buscado y coherencia interna.
  const levels = core.map((g) => g.formality);
  const spread = Math.max(...levels) - Math.min(...levels);
  const coherence = spread <= 1 ? 1 : spread === 2 ? 0.8 : 0.35;
  const ocasion = ctx.formality === null
    ? 0.55 + 0.45 * coherence
    : 0.65 * (1 - Math.min(1, Math.abs(mean(levels) - ctx.formality) / 2)) + 0.35 * coherence;

  // Color: paleta intencional; se premia repetir un color del estampado.
  const palette = judgePalette(core.map((g) => g.primary_color));
  const primaries = core.map((g) => g.primary_color);
  const echo = core.some((g) => g.secondary_colors.some((c) => primaries.includes(c)));
  const allSame = new Set(primaries).size === 1 && core.length >= 3;
  const color = clamp(palette.score + (echo ? 0.08 : 0) - (allSame && palette.kind === "neutros" ? 0.06 : 0), 0, 1);

  // Estampados: uno protagonista; dos solo si comparten color.
  const patterned = core.filter((g) => g.pattern !== "liso");
  const shareColor = patterned.length === 2 &&
    [patterned[0].primary_color, ...patterned[0].secondary_colors].some((c) => [patterned[1].primary_color, ...patterned[1].secondary_colors].includes(c));
  const estampado = patterned.length === 0 ? 0.9 : patterned.length === 1 ? 1 : patterned.length === 2 ? (shareColor ? 0.6 : 0.3) : 0.1;

  // Estilo: lenguaje compartido entre prendas, ocasión y perfil.
  const fits = (list: readonly string[]) => (list.length ? core.filter((g) => g.styles.some((s) => list.includes(s))).length / core.length : 0.6);
  const styleCounts = new Map<string, number>();
  core.forEach((g) => g.styles.forEach((s) => styleCounts.set(s, (styleCounts.get(s) ?? 0) + 1)));
  const shared = Math.max(0, ...styleCounts.values()) / core.length;
  const estilo = 0.4 * fits(ctx.occasionStyles) + 0.3 * fits(profile.styles) + 0.3 * shared;

  // Silueta: equilibrio de volúmenes según calce.
  let silueta = 0.82;
  if (top?.fit && bottom?.fit) {
    if (top.fit !== bottom.fit && top.fit !== "regular" && bottom.fit !== "regular") silueta = 1;
    else if (top.fit === "regular" || bottom.fit === "regular") silueta = 0.86;
    else silueta = profile.fit_preference === top.fit ? 0.9 : top.fit === "holgado" ? 0.55 : 0.65;
  }

  // Materiales: coherencia con la temperatura y contraste de texturas.
  const materials = core.map((g) => g.material).filter((m): m is string => Boolean(m));
  let material = materials.length >= 2 ? (new Set(materials).size >= 2 ? 0.92 : 0.72) : 0.8;
  if (ctx.temp > 25 && materials.some((m) => ["lana", "cuero", "pana"].includes(m))) material -= 0.4;
  if (ctx.temp < 12 && materials.includes("lino")) material -= 0.4;
  material = clamp(material, 0, 1);

  // Preferencias personales.
  let preferencias = 0.55;
  const favHits = core.filter((g) => profile.favorite_colors.includes(g.primary_color)).length;
  preferencias += Math.min(0.2, favHits * 0.1);
  if (core.some((g) => profile.avoided_colors.includes(g.primary_color) || intent.avoidColors.includes(g.primary_color))) preferencias -= 0.5;
  if (intent.colors.length) preferencias += core.some((g) => intent.colors.includes(g.primary_color)) ? 0.3 : -0.25;
  if (intent.comfort || profile.comfort_priority === 3) preferencias += (mean(core.map(comfortOf)) - 0.7) * 0.9;
  else if (profile.comfort_priority === 1) preferencias += 0.03;
  preferencias += core.filter((g) => g.is_favorite).length * 0.03;
  preferencias = clamp(preferencias, 0, 1);

  // Variedad: no repetir combinaciones ni las prendas de los últimos looks.
  let variedad = 0.7;
  if (ctx.recentSignatures.has(signature(items))) variedad = 0.05;
  else {
    variedad -= (core.filter((g) => ctx.recentIds.has(g.id)).length / core.length) * 0.4;
    variedad += (core.filter((g) => g.wear_count === 0).length / core.length) * 0.3;
  }
  variedad = clamp(variedad, 0, 1);

  const valoraciones = 0.5 + 0.5 * Math.tanh(mean(core.map((g) => ctx.affinity.get(g.id) ?? 0)) / 1.2);

  const parts: Record<ScorePart, number> = { clima, ocasion, color, estilo, estampado, silueta, material, preferencias, variedad, valoraciones };
  const score = (Object.keys(WEIGHTS) as ScorePart[]).reduce((sum, key) => sum + WEIGHTS[key] * parts[key], 0);
  return { items: sortBySlot(items), score, parts, palette };
}

// ───────────────────────────── Generación ─────────────────────────────
function pickAccessory(ctx: Ctx, items: Garment[], pool: Garment[]): Garment | null {
  if (pool.length === 0) return null;
  const core = items.filter((g) => g.category !== "accessory");
  const colors = core.flatMap((g) => [g.primary_color, ...g.secondary_colors]);
  const level = mean(core.map((g) => g.formality));
  let best: Garment | null = null;
  let bestScore = 0.62; // umbral: solo se suma si realmente aporta
  for (const acc of pool) {
    let s = 0.45;
    if (judgePalette([...core.map((g) => g.primary_color), acc.primary_color]).score >= 0.8) s += 0.2;
    if (colors.includes(acc.primary_color)) s += 0.1;
    if (Math.abs(acc.formality - level) <= 1.5) s += 0.1; else s -= 0.3;
    if (["bufanda", "gorro"].includes(acc.type)) s += ctx.temp < 12 ? 0.25 : -0.5;
    if (["gorra", "anteojos"].includes(acc.type) && ctx.temp < 16) s -= 0.2;
    if (acc.type === "anteojos") s -= ctx.night ? 1 : ctx.rain ? 0.4 : 0; // de noche o con lluvia no suman
    if (acc.is_favorite) s += 0.05;
    s += ctx.rng() * 0.08;
    if (s > bestScore) { best = acc; bestScore = s; }
  }
  return best;
}

/** Devuelve las mejores combinaciones posibles, de mayor a menor puntaje. */
export function generateOutfits(input: EngineInput, limit = 6): OutfitCandidate[] {
  const ctx = buildContext(input);
  const excluded = new Set(input.excludeIds ?? []);
  const lockedIds = [...new Set([...(input.lockedIds ?? []), ...input.intent.lockedIds])];
  const locked = input.garments.filter((g) => lockedIds.includes(g.id));
  const lockedIn = (c: Category) => locked.filter((g) => g.category === c);

  const pool = (category: Category, size: number): Garment[] => {
    const fixed = lockedIn(category);
    if (fixed.length && category !== "accessory") return fixed.slice(0, 1);
    return input.garments
      .filter((g) => g.category === category && !excluded.has(g.id))
      .map((g) => ({ g, s: unaryScore(ctx, g) }))
      .sort((a, b) => b.s - a.s)
      .slice(0, size)
      .map((x) => x.g);
  };

  const tops = pool("top", 8), bottoms = pool("bottom", 7), dresses = pool("dress", 5);
  const shoes = pool("shoes", 5), outers = pool("outerwear", 4);
  const accessories = input.garments.filter((g) => g.category === "accessory" && !excluded.has(g.id) && !lockedIds.includes(g.id));

  const bases: Garment[][] = [];
  const wantsSeparates = lockedIn("top").length > 0 || lockedIn("bottom").length > 0;
  const wantsDress = lockedIn("dress").length > 0;
  if (!wantsDress) for (const t of tops) for (const b of bottoms) bases.push([t, b]);
  if (!wantsSeparates) for (const d of dresses) bases.push([d]);
  if (bases.length === 0) return [];

  const shoeOptions: (Garment | null)[] = shoes.length ? shoes : [null];
  const outerLocked = lockedIn("outerwear").length > 0;
  const needsOuter = ctx.temp < 14 || (ctx.rain && ctx.temp < 22);
  const outerOptions: (Garment | null)[] = outers.length === 0
    ? [null]
    : outerLocked || needsOuter ? outers : ctx.temp > 23 ? [null] : [null, ...outers];

  const requiredTypes = input.intent.requiredTypes.filter((t) => input.garments.some((g) => g.type === t && !excluded.has(g.id)));
  const current = input.currentIds?.length ? signature(input.garments.filter((g) => input.currentIds!.includes(g.id))) : null;

  let candidates: OutfitCandidate[] = [];
  for (const base of bases) {
    for (const shoe of shoeOptions) {
      for (const outer of outerOptions) {
        const items = [...base, ...(shoe ? [shoe] : []), ...(outer ? [outer] : [])];
        if (requiredTypes.some((t) => !items.some((g) => g.type === t) && !accessories.some((a) => a.type === t))) continue;
        candidates.push(scoreOutfit(ctx, items));
      }
    }
  }
  // Si pidió una prenda puntual y ninguna combinación la incluye, se relaja el pedido.
  if (candidates.length === 0 && requiredTypes.length) {
    return generateOutfits({ ...input, intent: { ...input.intent, requiredTypes: [] } }, limit);
  }

  const different = candidates.filter((c) => signature(c.items) !== current);
  if (different.length) candidates = different;
  candidates.sort((a, b) => b.score - a.score);

  return candidates.slice(0, limit).map((candidate) => {
    const lockedAccessories = lockedIn("accessory").slice(0, 2);
    const requiredAccessory = accessories.find((a) => requiredTypes.includes(a.type));
    const extra = lockedAccessories.length ? lockedAccessories
      : requiredAccessory ? [requiredAccessory]
      : [pickAccessory(ctx, candidate.items, accessories)].filter((a): a is Garment => Boolean(a));
    return extra.length ? { ...candidate, items: sortBySlot([...candidate.items, ...extra]) } : candidate;
  });
}

/** Elige una combinación entre las mejores, con algo de azar para dar variedad. */
export function pickOutfit(input: EngineInput): OutfitCandidate | null {
  const top = generateOutfits(input, 5);
  if (top.length === 0) return null;
  const rng = input.rng ?? Math.random;
  const weights = top.map((c) => Math.exp((c.score - top[0].score) / 0.025));
  let roll = rng() * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < top.length; i++) {
    roll -= weights[i];
    if (roll <= 0) return top[i];
  }
  return top[0];
}

/** Reemplaza una sola prenda manteniendo el resto del outfit. */
export function replaceGarment(input: EngineInput, currentItems: Garment[], garmentId: string): OutfitCandidate | null {
  const target = currentItems.find((g) => g.id === garmentId);
  if (!target) return null;
  const ctx = buildContext(input);
  const rest = currentItems.filter((g) => g.id !== garmentId);
  const excluded = new Set([...(input.excludeIds ?? []), ...currentItems.map((g) => g.id)]);
  const options = input.garments
    .filter((g) => g.category === target.category && !excluded.has(g.id))
    .map((g) => scoreOutfit(ctx, [...rest, g]))
    .sort((a, b) => b.score - a.score);
  if (options.length === 0) return null;
  const shortlist = options.slice(0, 3);
  return shortlist[Math.floor((input.rng ?? Math.random)() * shortlist.length)];
}

/** Puntúa un outfit ya armado (por ejemplo, el que propone la IA). */
export function evaluateOutfit(input: EngineInput, items: Garment[]): OutfitCandidate {
  return scoreOutfit(buildContext(input), items);
}

export function missingForOutfit(garments: Garment[]): string | null {
  const has = (c: Category) => garments.some((g) => g.category === c);
  if (has("dress") || (has("top") && has("bottom"))) return null;
  if (!has("top") && !has("bottom")) return "Cargá al menos una parte superior y una inferior (o un vestido) para armar tu primer outfit.";
  return has("top")
    ? "Te falta una parte inferior (jean, pantalón, pollera…) para poder armar un outfit."
    : "Te falta una parte superior (remera, camisa, sweater…) para poder armar un outfit.";
}
