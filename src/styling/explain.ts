// Explicación en lenguaje natural de un outfit generado por el motor.
// Se construye con los motivos reales del puntaje, no con frases genéricas.
import { OCCASIONS, type StylingWeather } from "@shared/taxonomy.ts";
import type { Garment } from "@/lib/types";
import { joinList, lowerFirst } from "@/lib/format";
import type { Intent, OutfitCandidate } from "./engine";

const name = (g: Garment) => lowerFirst(g.name);

export function explainOutfit(candidate: OutfitCandidate, weather: StylingWeather | null, intent: Intent, temp?: number): string {
  const { items, palette } = candidate;
  const find = (c: Garment["category"]) => items.find((g) => g.category === c);
  const dress = find("dress"), top = find("top"), bottom = find("bottom");
  const shoes = find("shoes"), outer = find("outerwear");
  const accessories = items.filter((g) => g.category === "accessory");
  const sentences: string[] = [];

  const basePieces = dress ? [name(dress)] : [top, bottom].filter((g): g is Garment => Boolean(g)).map(name);
  const rest = [shoes, ...accessories].filter((g): g is Garment => Boolean(g)).map(name);
  sentences.push(
    dress
      ? `Armé el look alrededor de ${basePieces[0]}${rest.length ? `, con ${joinList(rest)}` : ""}.`
      : `Armé el look con ${joinList([...basePieces, ...rest])}.`,
  );

  const [a, b] = palette.accents;
  const colorLine: Record<typeof palette.kind, string> = {
    neutros: "La paleta en neutros mantiene todo en armonía y deja que hablen las texturas.",
    acento: `El ${a} es el único color protagonista sobre una base neutra, así que destaca sin competir.`,
    analogos: `El ${a} y el ${b} son tonos vecinos: se leen como una misma familia de color.`,
    complementarios: `El contraste entre ${a} y ${b} le da fuerza al conjunto; el resto queda en neutros para equilibrar.`,
    mixto: `Combina ${a} y ${b}: es una mezcla más jugada, sostenida por el resto de las prendas en tonos calmos.`,
    saturado: "Es una combinación con mucho color: usala cuando quieras un look bien protagonista.",
  };
  sentences.push(colorLine[palette.kind]);

  const openShoes = Boolean(shoes && ["sandalia", "taco"].includes(shoes.type));
  const feels = temp ?? weather?.feelsLikeC;
  const rain = intent.rain ?? weather?.rain ?? false;
  if (feels !== undefined) {
    const t = Math.round(feels);
    if (outer && rain) sentences.push(`Sumé ${name(outer)} para la lluvia${outer.waterproof ? "" : ", aunque no es impermeable: llevá paraguas"}${openShoes ? ". Ojo: el calzado es abierto y no es lo ideal con lluvia; si tenés uno cerrado, cargalo en tu guardarropa" : ""}.`);
    else if (outer && intent.warmthShift > 0) sentences.push(`Sumé ${name(outer)} porque pediste algo abrigado.`);
    else if (outer) sentences.push(`Sumé ${name(outer)} porque la sensación térmica ronda los ${t}°.`);
    else if (rain && openShoes) sentences.push(`Se espera lluvia y ${name(shoes!)} es calzado abierto: no es lo ideal. Si tenés calzado cerrado, cargalo en tu guardarropa y lo voy a preferir.`);
    else if (rain) sentences.push("Como se espera lluvia, prioricé calzado cerrado y telas que no sufren el agua.");
    else if (feels < 14 && intent.warmthShift <= 0) sentences.push(`Con ${t}° convendría un abrigo, pero todavía no cargaste ninguno en tu guardarropa.`);
    else if (feels >= 25 && intent.warmthShift <= 0) sentences.push(`Con ${t}° prioricé prendas livianas y pocas capas.`);
  }

  const occasion = OCCASIONS.find((o) => o.id === intent.occasion);
  if (occasion && sentences.length < 4) {
    const fit = candidate.parts.ocasion >= 0.7
      ? `El nivel de formalidad va bien para ${occasion.label.toLowerCase()}.`
      : `Es lo más cercano que encontré en tu guardarropa para ${occasion.label.toLowerCase()}.`;
    sentences.push(fit);
  }

  const unworn = items.find((g) => g.wear_count === 0 && g.category !== "accessory");
  if (unworn && sentences.length < 4) sentences.push(`De paso, le das uso a ${name(unworn)}, que todavía no estrenaste acá.`);
  if (!shoes && sentences.length < 5) sentences.push("No encontré calzado en tu guardarropa: cargá un par para completar el look.");

  return sentences.join(" ");
}
