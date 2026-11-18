// Reconocimiento de prendas 100 % local y gratuito: un modelo CLIP corre dentro
// del navegador (Transformers.js + ONNX/WebAssembly), sin API key ni backend.
// La foto nunca sale del dispositivo. El modelo (~90 MB) se descarga una sola vez
// y queda en la caché del navegador.
import {
  ALL_TYPES, TYPES_BY_CATEGORY, type Category, type ClassificationResult,
} from "@shared/taxonomy.ts";
import { levelsFor } from "./garmentDefaults";
import { loadTransformers, progressTracker } from "./transformers";

const MODEL = "Xenova/clip-vit-base-patch32";

// Descripciones en inglés (CLIP rinde mucho mejor así) → tipo de la taxonomía.
const TYPE_PROMPTS: Record<string, string> = {
  remera: "a t-shirt", musculosa: "a sleeveless tank top", camisa: "a button-up shirt", blusa: "a blouse",
  top: "a crop top", sweater: "a knitted sweater", buzo: "a hoodie sweatshirt", polera: "a turtleneck sweater", body: "a bodysuit",
  jean: "a pair of blue jeans", "pantalón": "a pair of trousers", "pantalón de vestir": "a pair of dress pants",
  pollera: "a skirt", short: "a pair of shorts", bermuda: "a pair of bermuda shorts", calza: "a pair of leggings", jogger: "a pair of jogger sweatpants",
  vestido: "a dress", mono: "a jumpsuit", enterito: "a denim overall",
  campera: "a jacket", blazer: "a blazer", saco: "a suit jacket", tapado: "a long wool coat", "cárdigan": "a cardigan",
  chaleco: "a vest", trench: "a trench coat", piloto: "a raincoat", puffer: "a puffer down jacket",
  zapatilla: "a pair of sneakers", bota: "a pair of tall boots", botineta: "a pair of ankle boots", borcego: "a pair of combat boots",
  sandalia: "a pair of sandals", zapato: "a pair of leather dress shoes", "mocasín": "a pair of loafers", taco: "a pair of high heels", chatita: "a pair of ballet flats",
  cartera: "a handbag", mochila: "a backpack", "cinturón": "a belt", bufanda: "a scarf", "pañuelo": "a bandana", gorro: "a knit beanie hat",
  gorra: "a baseball cap", anteojos: "a pair of sunglasses", collar: "a necklace", aros: "a pair of earrings", reloj: "a wristwatch",
};

// Si gana alguna de estas, la imagen no es una prenda.
const NOT_GARMENT_PROMPTS = [
  "a person's face", "a landscape", "a plate of food", "an animal", "a room interior", "a car", "a screenshot of text",
];

const PATTERN_PROMPTS: Record<string, string> = {
  liso: "a plain solid-colored garment", rayado: "a striped garment", cuadros: "a plaid checkered garment",
  floral: "a garment with a floral print", lunares: "a polka dot garment", "animal print": "a leopard animal print garment",
  "geométrico": "a garment with a geometric pattern",
};

const STYLE_PROMPTS: Record<string, string> = {
  casual: "a casual everyday garment", formal: "a formal office garment", deportivo: "a sporty athletic garment",
  elegante: "an elegant evening garment", urbano: "a streetwear garment", minimalista: "a minimalist garment",
  "romántico": "a romantic feminine garment", bohemio: "a bohemian boho garment", "clásico": "a classic timeless garment",
};

// Temporadas orientativas por abrigo: la ficha es corregible a mano.
function seasonsFor(warmth: number): string[] {
  if (warmth <= 1) return ["verano", "primavera"];
  if (warmth === 2) return ["verano", "primavera", "otoño"];
  if (warmth === 3) return ["primavera", "otoño", "invierno"];
  return ["otoño", "invierno"];
}

const CATEGORY_OF: Record<string, Category> = Object.fromEntries(
  (Object.entries(TYPES_BY_CATEGORY) as [Category, readonly string[]][]).flatMap(([category, types]) => types.map((t) => [t, category])),
);

type ZeroShot = (image: Blob, labels: string[], options?: { hypothesis_template?: string }) => Promise<{ label: string; score: number }[]>;

let classifierPromise: Promise<ZeroShot> | null = null;

export type VisionProgress = (percent: number) => void;

/** Carga el modelo (una sola vez por sesión). Los avances se informan en 0–100. */
export function loadVisionModel(onProgress?: VisionProgress): Promise<ZeroShot> {
  classifierPromise ??= (async () => {
    const { pipeline } = await loadTransformers();
    const classifier = await pipeline("zero-shot-image-classification", MODEL, { progress_callback: progressTracker(onProgress) });
    return classifier as unknown as ZeroShot;
  })().catch((error) => {
    classifierPromise = null; // permite reintentar si falló la descarga
    throw error;
  });
  return classifierPromise;
}

async function rank(classify: ZeroShot, image: Blob, prompts: Record<string, string>) {
  const keys = Object.keys(prompts);
  const result = await classify(image, keys.map((k) => prompts[k]), { hypothesis_template: "a photo of {}." });
  const byPrompt = new Map(Object.entries(prompts).map(([k, v]) => [v, k]));
  return result.map((r) => ({ key: byPrompt.get(r.label) ?? r.label, score: r.score })).sort((a, b) => b.score - a.score);
}

export interface LocalAnalysis {
  isGarment: boolean;
  confidence: number;
  fields: Omit<ClassificationResult, "is_garment" | "confidence" | "name" | "primary_color" | "secondary_colors">;
}

/** Clasifica una foto de prenda. El color lo resuelve el análisis de píxeles aparte (más fiable). */
export async function analyzeGarmentLocally(image: Blob, onProgress?: VisionProgress): Promise<LocalAnalysis> {
  const classify = await loadVisionModel(onProgress);

  const typeAndOthers: Record<string, string> = { ...TYPE_PROMPTS };
  NOT_GARMENT_PROMPTS.forEach((p, i) => { typeAndOthers[`__no${i}`] = p; });
  const types = await rank(classify, image, typeAndOthers);
  const best = types[0];
  const confidence = best.score;
  if (best.key.startsWith("__no")) {
    return { isGarment: false, confidence, fields: emptyFields() };
  }

  const type = ALL_TYPES.includes(best.key) ? best.key : "remera";
  const category = CATEGORY_OF[type];
  const [patterns, styles] = await Promise.all([rank(classify, image, PATTERN_PROMPTS), rank(classify, image, STYLE_PROMPTS)]);
  const { warmth, formality } = levelsFor(type);
  const noFit = category === "shoes" || category === "accessory";

  return {
    isGarment: true,
    confidence,
    fields: {
      category, type,
      pattern: patterns[0].score >= 0.5 ? patterns[0].key : "liso",
      styles: styles.slice(0, 2).filter((s, i) => i === 0 || s.score >= 0.2).map((s) => s.key),
      seasons: seasonsFor(warmth),
      material: type === "jean" || type === "enterito" ? "denim" : null,
      fit: noFit ? null : "regular",
      warmth, formality,
      waterproof: type === "piloto",
    },
  };
}

function emptyFields(): LocalAnalysis["fields"] {
  return {
    category: "top", type: "remera", pattern: "liso", styles: ["casual"], seasons: ["verano"], material: null,
    fit: "regular", warmth: 2, formality: 2, waterproof: false,
  };
}
