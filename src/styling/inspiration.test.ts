import { describe, expect, it } from "vitest";
import type { Garment } from "@/lib/types";
import type { InspirationPiece } from "@/lib/inspirationVision";
import { buildVersions, similarity } from "./inspiration";

let seq = 0;
function g(p: Partial<Garment> & Pick<Garment, "category" | "type" | "primary_color">): Garment {
  seq += 1;
  return {
    id: `i${seq}`, user_id: "u", name: `${p.type} ${p.primary_color}`, secondary_colors: [], pattern: "liso", styles: ["casual"], seasons: [],
    material: null, fit: "regular", warmth: 2, formality: 2, waterproof: false, notes: null, is_favorite: false, ai_classified: false,
    wear_count: 0, last_worn_on: null, created_at: "2026-01-01", garment_images: [], thumbUrl: null, ...p,
  };
}
const piece = (category: InspirationPiece["category"], type: string, color: string, pattern = "liso"): InspirationPiece => ({ category, type, color, secondary: [], pattern });

const wardrobe = [
  g({ category: "top", type: "remera", primary_color: "blanco" }),
  g({ category: "top", type: "sweater", primary_color: "rojo", formality: 3 }),
  g({ category: "bottom", type: "jean", primary_color: "denim" }),
  g({ category: "bottom", type: "pollera", primary_color: "negro", formality: 3 }),
  g({ category: "shoes", type: "zapatilla", primary_color: "blanco" }),
  g({ category: "shoes", type: "taco", primary_color: "negro", formality: 5 }),
];

describe("inspiración: parecido y armado", () => {
  it("prefiere mismo tipo y color", () => {
    const p = piece("top", "remera", "blanco");
    expect(similarity(p, wardrobe[0])).toBeGreaterThan(similarity(p, wardrobe[1]));
  });
  it("una prenda de otra categoría no se parece", () => {
    expect(similarity(piece("top", "remera", "blanco"), wardrobe[2])).toBe(0);
  });
  it("arma la versión con las prendas más parecidas", () => {
    const [best] = buildVersions([piece("top", "remera", "blanco"), piece("bottom", "jean", "celeste"), piece("shoes", "zapatilla", "blanco")], wardrobe);
    expect(best.items.map((i) => i.type)).toEqual(["remera", "jean", "zapatilla"]);
    expect(best.complete).toBe(true);
    expect(best.missing).toHaveLength(0);
  });
  it("informa lo que no existe en el guardarropa y no lo inventa", () => {
    const [best] = buildVersions([piece("top", "remera", "blanco"), piece("bottom", "jean", "denim"), piece("outerwear", "campera", "negro")], wardrobe);
    expect(best.missing.map((m) => m.type)).toEqual(["campera"]);
    expect(best.items.some((i) => i.category === "outerwear")).toBe(false);
  });
  it("no repite prendas y ofrece alternativas", () => {
    const withAlt = [...wardrobe, g({ category: "top", type: "camisa", primary_color: "blanco", formality: 3 })];
    const versions = buildVersions([piece("top", "remera", "blanco"), piece("bottom", "jean", "denim")], withAlt);
    expect(versions.length).toBeGreaterThan(1);
    versions.forEach((v) => expect(new Set(v.items.map((i) => i.id)).size).toBe(v.items.length));
  });
  it("sin prenda parecida, usa lo más cercano en lo esencial y lo marca como aproximado", () => {
    const [best] = buildVersions([piece("top", "buzo", "gris"), piece("bottom", "jean", "denim")], wardrobe);
    const top = best.matches.find((m) => m.piece.category === "top")!;
    expect(top.garment).not.toBeNull();
    expect(top.approx).toBe(true);
    expect(best.complete).toBe(true);
  });
});
