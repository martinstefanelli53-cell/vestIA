// Intérprete de pedidos en lenguaje natural basado en reglas.
// Es el respaldo del asistente con IA: cuando el modelo no está disponible,
// igual se entiende "algo cómodo para ir a trabajar" o "quiero usar esta camisa".
import { ALL_TYPES, COLOR_NAMES, STYLES } from "@shared/taxonomy.ts";
import type { Garment } from "@/lib/types";
import { EMPTY_INTENT, type Intent } from "./engine";

export const normalize = (text: string) => text.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

const OCCASION_WORDS: [string, RegExp][] = [
  ["trabajo", /\b(trabaj\w*|oficina|laburo|reunion\w*|entrevista)\b/],
  ["universidad", /\b(facu\w*|universidad|clases?|cursar|cursada)\b/],
  ["cita", /\b(cita|cenar|cena|date|aniversario)\b/],
  ["fiesta", /\b(fiesta|boliche|bailar|cumple\w*|previa)\b/],
  ["evento", /\b(evento|casamiento|boda|gala|ceremonia|graduacion|recepcion)\b/],
  ["viaje", /\b(viaj\w*|avion|escapada|vacaciones|aeropuerto)\b/],
  ["deporte", /\b(gym|gimnasio|entren\w*|correr|deporte\w*|yoga|caminata)\b/],
  ["informal", /\b(amig\w*|pasear|paseo|bar|cafe|merienda|brunch|tranqui\w*|informal|salir|salida)\b/],
];

const hasWord = (text: string, word: string) => new RegExp(`\\b${word}(s|es)?\\b`).test(text);

export function parseIntent(message: string | undefined, garments: Garment[]): Intent {
  const intent: Intent = { ...EMPTY_INTENT, styles: [], colors: [], avoidColors: [], requiredTypes: [], lockedIds: [] };
  const text = normalize(message ?? "").trim();
  if (!text) return intent;

  intent.occasion = OCCASION_WORDS.find(([, re]) => re.test(text))?.[0] ?? null;

  const more = /\bmas\b/.test(text), less = /\bmenos\b/.test(text);
  const dressy = /\b(elegante\w*|formal\w*|arreglad\w*|sofisticad\w*|chic)\b/.test(text);
  const relaxed = /\b(casual\w*|relajad\w*|informal\w*|sencill\w*|simple)\b/.test(text);
  if (dressy) (more ? (intent.formalityShift = 1) : less ? (intent.formalityShift = -1) : (intent.formalityTarget = 4));
  else if (relaxed) (more ? (intent.formalityShift = -1) : (intent.formalityTarget = 2));

  if (/\b(frio|abrigad\w*|helad\w*|fresco|calentit\w*)\b/.test(text)) intent.warmthShift = 1;
  if (/\b(calor|livian\w*|fresc[ao]s?|fresquit\w*|caluros\w*)\b/.test(text) && !/\bfresco\b/.test(text)) intent.warmthShift = -1;
  if (/\b(comod\w*|confortable\w*|descansad\w*)\b/.test(text)) intent.comfort = true;
  if (/\b(lluvia|llueve|llov\w*|lluvios\w*)\b/.test(text)) intent.rain = !/\b(sin|no)\s+(lluvia|llueve)\b/.test(text);

  intent.styles = STYLES.filter((s) => hasWord(text, normalize(s)));

  // Colores: "sin negro" / "nada de rojo" los excluye; el resto son pedidos.
  for (const color of [...COLOR_NAMES].sort((a, b) => b.length - a.length)) {
    const c = normalize(color);
    if (!hasWord(text, c)) continue;
    if (new RegExp(`\\b(sin|no|nada de|evita\\w*)\\s+(el |la |color )?${c}`).test(text)) intent.avoidColors.push(color);
    else if (!intent.colors.some((other) => normalize(other).includes(c))) intent.colors.push(color);
  }

  // Prendas mencionadas: si coincide una sola (por tipo y color), se fija; si no, se exige el tipo.
  for (const type of [...ALL_TYPES].sort((a, b) => b.length - a.length)) {
    if (!hasWord(text, normalize(type))) continue;
    if (intent.requiredTypes.some((t) => normalize(t).includes(normalize(type)))) continue;
    const ofType = garments.filter((g) => g.type === type);
    if (ofType.length === 0) continue;
    const byColor = ofType.filter((g) => intent.colors.includes(g.primary_color));
    const matches = byColor.length ? byColor : ofType;
    if (matches.length === 1) intent.lockedIds.push(matches[0].id);
    else intent.requiredTypes.push(type);
    // El color nombrado describía la prenda, no una preferencia general de color.
    if (byColor.length) intent.colors = intent.colors.filter((c) => !byColor.some((g) => g.primary_color === c));
  }
  return intent;
}
