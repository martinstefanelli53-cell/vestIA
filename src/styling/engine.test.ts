import { describe, expect, it } from "vitest";
import type { StylingWeather } from "@shared/taxonomy.ts";
import type { Garment } from "@/lib/types";
import { EMPTY_INTENT, generateOutfits, isValidOutfit, pickOutfit, replaceGarment, signature, type EngineInput } from "./engine";
import { explainOutfit } from "./explain";
import { parseIntent } from "./intent";

let seq = 0;
function garment(partial: Partial<Garment> & Pick<Garment, "category" | "type" | "primary_color">): Garment {
  seq += 1;
  return {
    id: `g${seq}`, user_id: "u", name: `${partial.type} ${partial.primary_color}`, secondary_colors: [], pattern: "liso",
    styles: ["casual"], seasons: [], material: null, fit: "regular", warmth: 2, formality: 2, waterproof: false, notes: null,
    is_favorite: false, ai_classified: false, wear_count: 1, last_worn_on: null, created_at: "2026-01-01", garment_images: [], thumbUrl: null,
    ...partial,
  };
}

const wardrobe: Garment[] = [
  garment({ category: "top", type: "remera", primary_color: "blanco", warmth: 2, formality: 2 }),
  garment({ category: "top", type: "camisa", primary_color: "blanco", warmth: 2, formality: 4, styles: ["formal", "clásico"] }),
  garment({ category: "top", type: "sweater", primary_color: "rojo", warmth: 4, formality: 3 }),
  garment({ category: "top", type: "musculosa", primary_color: "negro", warmth: 1, formality: 2 }),
  garment({ category: "bottom", type: "jean", primary_color: "denim", warmth: 3, formality: 2 }),
  garment({ category: "bottom", type: "pantalón de vestir", primary_color: "negro", warmth: 3, formality: 4, styles: ["formal"] }),
  garment({ category: "bottom", type: "short", primary_color: "beige", warmth: 1, formality: 1 }),
  garment({ category: "dress", type: "vestido", primary_color: "negro", warmth: 2, formality: 4, styles: ["elegante"] }),
  garment({ category: "outerwear", type: "campera", primary_color: "negro", warmth: 4, formality: 2 }),
  garment({ category: "outerwear", type: "piloto", primary_color: "beige", warmth: 3, formality: 3, waterproof: true }),
  garment({ category: "outerwear", type: "blazer", primary_color: "gris", warmth: 3, formality: 4, styles: ["formal"] }),
  garment({ category: "shoes", type: "zapatilla", primary_color: "blanco", warmth: 3, formality: 2 }),
  garment({ category: "shoes", type: "sandalia", primary_color: "camel", warmth: 1, formality: 2 }),
  garment({ category: "shoes", type: "bota", primary_color: "negro", warmth: 4, formality: 3, waterproof: true }),
  garment({ category: "shoes", type: "taco", primary_color: "negro", warmth: 2, formality: 5, styles: ["elegante"] }),
  garment({ category: "accessory", type: "bufanda", primary_color: "gris", warmth: 4, formality: 2 }),
];

const weather = (feelsLikeC: number, rain = false): StylingWeather => ({ feelsLikeC, minC: feelsLikeC - 3, maxC: feelsLikeC + 3, rain, condition: "", simulated: false });
const seeded = () => {
  let s = 42;
  return () => ((s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296);
};
const input = (over: Partial<EngineInput> = {}): EngineInput => ({
  garments: wardrobe,
  profile: { styles: ["casual"], favorite_colors: [], avoided_colors: [], comfort_priority: 2, fit_preference: "regular" },
  weather: weather(18), season: "otoño", intent: EMPTY_INTENT, history: [], rng: seeded(), ...over,
});
const types = (items: Garment[]) => items.map((g) => g.type);

describe("motor de estilismo", () => {
  it("solo usa prendas del guardarropa y arma estructuras válidas", () => {
    const outfits = generateOutfits(input(), 6);
    expect(outfits.length).toBeGreaterThan(0);
    for (const o of outfits) {
      expect(isValidOutfit(o.items)).toBe(true);
      expect(o.items.every((g) => wardrobe.includes(g))).toBe(true);
    }
  });

  it("con frío siempre suma abrigo y evita prendas muy livianas", () => {
    const best = generateOutfits(input({ weather: weather(6), season: "invierno" }), 3);
    for (const o of best) {
      expect(o.items.some((g) => g.category === "outerwear")).toBe(true);
      expect(types(o.items)).not.toContain("short");
      expect(types(o.items)).not.toContain("sandalia");
    }
  });

  it("con calor no agrega abrigo y prioriza prendas livianas", () => {
    const best = generateOutfits(input({ weather: weather(31), season: "verano" }), 1)[0];
    expect(best.items.some((g) => g.category === "outerwear")).toBe(false);
    expect(types(best.items)).not.toContain("sweater");
    expect(types(best.items)).not.toContain("bota");
  });

  it("con lluvia evita calzado abierto y prefiere abrigo impermeable", () => {
    const best = generateOutfits(input({ weather: weather(16, true) }), 3);
    for (const o of best) {
      expect(types(o.items)).not.toContain("sandalia");
      expect(types(o.items)).not.toContain("taco");
    }
    expect(types(best[0].items)).toContain("piloto");
  });

  it("recalcula distinto al simular lluvia sobre el mismo clima", () => {
    const dry = generateOutfits(input({ weather: weather(26, false), season: "verano" }), 1)[0];
    const wet = generateOutfits(input({ weather: weather(26, true), season: "verano" }), 1)[0];
    expect(types(dry.items)).toContain("sandalia");
    expect(types(wet.items)).not.toContain("sandalia");
  });

  it("adapta la formalidad a la ocasión", () => {
    const work = generateOutfits(input({ intent: { ...EMPTY_INTENT, occasion: "evento" } }), 1)[0];
    const avg = work.items.reduce((s, g) => s + g.formality, 0) / work.items.length;
    expect(avg).toBeGreaterThanOrEqual(3.5);
    const sport = generateOutfits(input({ intent: { ...EMPTY_INTENT, occasion: "viaje" } }), 1)[0];
    expect(types(sport.items)).not.toContain("taco");
  });

  it("respeta prendas fijadas y excluidas", () => {
    const sweater = wardrobe.find((g) => g.type === "sweater")!;
    const jean = wardrobe.find((g) => g.type === "jean")!;
    const outfits = generateOutfits(input({ lockedIds: [sweater.id], excludeIds: [jean.id] }), 6);
    for (const o of outfits) {
      expect(o.items).toContain(sweater);
      expect(o.items).not.toContain(jean);
    }
  });

  it("no repite la combinación actual ni las recientes", () => {
    const first = pickOutfit(input())!;
    const ids = first.items.map((g) => g.id);
    const second = generateOutfits(input({ currentIds: ids, history: [{ ids, rating: null }] }), 1)[0];
    expect(signature(second.items)).not.toBe(signature(first.items));
  });

  it("aprende de las valoraciones negativas", () => {
    const sweater = wardrobe.find((g) => g.type === "sweater")!;
    const history = Array.from({ length: 4 }, () => ({ ids: [sweater.id, wardrobe[4].id], rating: -1 }));
    const cold = { weather: weather(12), season: "invierno" };
    const before = generateOutfits(input(cold), 6).filter((o) => o.items.includes(sweater)).length;
    const after = generateOutfits(input({ ...cold, history }), 6).filter((o) => o.items.includes(sweater)).length;
    expect(after).toBeLessThanOrEqual(before);
  });

  it("reemplaza una sola prenda y conserva el resto", () => {
    const current = pickOutfit(input())!.items;
    const target = current.find((g) => g.category === "shoes")!;
    const swapped = replaceGarment(input(), current, target.id)!;
    expect(swapped.items).not.toContain(target);
    for (const g of current.filter((x) => x.id !== target.id)) expect(swapped.items).toContain(g);
  });

  it("devuelve vacío si el guardarropa no alcanza", () => {
    expect(generateOutfits(input({ garments: wardrobe.filter((g) => g.category === "shoes") }))).toEqual([]);
  });

  it("explica el outfit nombrando prendas reales", () => {
    const best = generateOutfits(input({ weather: weather(8) }), 1)[0];
    const text = explainOutfit(best, weather(8), EMPTY_INTENT);
    expect(text).toMatch(/Armé el look/);
    expect(text).toMatch(/8°/);
  });
});

describe("intérprete de pedidos", () => {
  it("detecta ocasión y comodidad", () => {
    const intent = parseIntent("Quiero algo cómodo para ir a trabajar", wardrobe);
    expect(intent.occasion).toBe("trabajo");
    expect(intent.comfort).toBe(true);
  });

  it("interpreta salir a cenar como cita", () => {
    expect(parseIntent("Armame un look para salir a cenar", wardrobe).occasion).toBe("cita");
  });

  it("fija la prenda mencionada cuando es única", () => {
    const vestido = wardrobe.find((g) => g.type === "vestido")!;
    expect(parseIntent("Quiero usar este vestido", wardrobe).lockedIds).toEqual([vestido.id]);
  });

  it("distingue entre varias prendas del mismo tipo usando el color", () => {
    const camisa = wardrobe.find((g) => g.type === "camisa")!;
    const intent = parseIntent("quiero usar la camisa blanca", wardrobe);
    expect(intent.lockedIds).toEqual([camisa.id]);
    expect(intent.colors).toEqual([]);
  });

  it("entiende pedidos relativos y de abrigo", () => {
    expect(parseIntent("Busco algo más elegante", wardrobe).formalityShift).toBe(1);
    expect(parseIntent("Hace frío, recomendame algo abrigado", wardrobe).warmthShift).toBe(1);
    expect(parseIntent("algo liviano que hace calor", wardrobe).warmthShift).toBe(-1);
  });

  it("separa colores pedidos de colores a evitar", () => {
    const intent = parseIntent("algo con rojo pero sin negro", wardrobe);
    expect(intent.colors).toContain("rojo");
    expect(intent.avoidColors).toContain("negro");
  });

  it("más elegante sube la formalidad respecto del outfit actual", () => {
    const current = [wardrobe[0], wardrobe[4], wardrobe[11]];
    const intent = parseIntent("más elegante", wardrobe);
    const next = generateOutfits(input({ intent, currentIds: current.map((g) => g.id) }), 1)[0];
    const avg = (items: Garment[]) => items.reduce((s, g) => s + g.formality, 0) / items.length;
    expect(avg(next.items)).toBeGreaterThan(avg(current));
  });
});
