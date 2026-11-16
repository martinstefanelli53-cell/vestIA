// Valores sugeridos de abrigo y formalidad por tipo de prenda. Se usan para
// precompletar la ficha cuando la persona clasifica a mano.
import { SEASONS, TYPES_BY_CATEGORY, type Category, type GarmentAttributes } from "@shared/taxonomy.ts";

const LEVELS: Record<string, [warmth: number, formality: number]> = {
  remera: [2, 2], musculosa: [1, 2], camisa: [2, 3], blusa: [2, 3], top: [1, 2], sweater: [4, 3], buzo: [4, 1], polera: [4, 3], body: [2, 3],
  jean: [3, 2], "pantalón": [3, 3], "pantalón de vestir": [3, 4], pollera: [2, 3], short: [1, 1], bermuda: [1, 2], calza: [2, 1], jogger: [3, 1],
  vestido: [2, 4], mono: [2, 3], enterito: [2, 2],
  campera: [4, 2], blazer: [3, 4], saco: [4, 4], tapado: [5, 4], "cárdigan": [3, 2], chaleco: [3, 2], trench: [3, 4], piloto: [3, 2], puffer: [5, 2],
  zapatilla: [3, 2], bota: [4, 3], botineta: [4, 3], borcego: [4, 2], sandalia: [1, 2], zapato: [3, 4], "mocasín": [3, 3], taco: [2, 5], chatita: [2, 3],
  bufanda: [4, 2], gorro: [4, 2],
};

export function levelsFor(type: string): { warmth: number; formality: number } {
  const [warmth, formality] = LEVELS[type] ?? [2, 2];
  return { warmth, formality };
}

export function defaultAttributes(category: Category = "top"): GarmentAttributes & { notes: string | null } {
  const type = TYPES_BY_CATEGORY[category][0];
  return {
    name: "", category, type, primary_color: "negro", secondary_colors: [], pattern: "liso", styles: ["casual"],
    seasons: [...SEASONS], material: null, fit: category === "shoes" || category === "accessory" ? null : "regular",
    ...levelsFor(type), waterproof: type === "piloto", notes: null,
  };
}

export const WARMTH_LABELS = ["Muy liviana", "Liviana", "Media", "Abrigada", "Muy abrigada"];
export const FORMALITY_LABELS = ["Muy informal", "Casual", "Casual arreglado", "Formal", "De gala"];
