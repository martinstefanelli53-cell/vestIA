// Taxonomía de VESTIA: única fuente de verdad compartida entre el backend
// (Edge Function) y el frontend (alias `@shared`). Solo datos y tipos, sin
// dependencias, para poder importarse desde ambos entornos.

export const CATEGORIES = ["top", "bottom", "dress", "outerwear", "shoes", "accessory"] as const;
export type Category = (typeof CATEGORIES)[number];

export const CATEGORY_LABELS: Record<Category, string> = {
  top: "Parte superior",
  bottom: "Parte inferior",
  dress: "Vestido",
  outerwear: "Abrigo",
  shoes: "Calzado",
  accessory: "Accesorio",
};

export const TYPES_BY_CATEGORY: Record<Category, readonly string[]> = {
  top: ["remera", "musculosa", "camisa", "blusa", "top", "sweater", "buzo", "polera", "body"],
  bottom: ["jean", "pantalón", "pantalón de vestir", "pollera", "short", "bermuda", "calza", "jogger"],
  dress: ["vestido", "mono", "enterito"],
  outerwear: ["campera", "blazer", "saco", "tapado", "cárdigan", "chaleco", "trench", "piloto", "puffer"],
  shoes: ["zapatilla", "bota", "botineta", "borcego", "sandalia", "zapato", "mocasín", "taco", "chatita"],
  accessory: ["cartera", "mochila", "cinturón", "bufanda", "pañuelo", "gorro", "gorra", "anteojos", "collar", "aros", "reloj"],
};
export const ALL_TYPES = Object.values(TYPES_BY_CATEGORY).flat();

export const COLORS = {
  negro: "#111111",
  blanco: "#FFFFFF",
  gris: "#8E8E8E",
  crema: "#F3ECDC",
  beige: "#D9C7A8",
  camel: "#B98A55",
  marrón: "#6B4A32",
  denim: "#4F6F94",
  "azul marino": "#1F2A44",
  azul: "#2F5BB7",
  celeste: "#9CC4E4",
  verde: "#2E7D4F",
  "verde oliva": "#6B7040",
  rojo: "#C62828",
  bordó: "#6D1F2B",
  rosa: "#E8A5B8",
  fucsia: "#C2185B",
  lila: "#B9A3D6",
  violeta: "#6A3D9A",
  amarillo: "#F2D03B",
  mostaza: "#C99A2E",
  naranja: "#E0762F",
  dorado: "#C8A951",
  plateado: "#BFC3C7",
} as const;
export type ColorName = keyof typeof COLORS;
export const COLOR_NAMES = Object.keys(COLORS) as ColorName[];

// Neutros: combinan con todo y no cuentan como "color protagonista".
export const NEUTRAL_COLORS: readonly string[] = [
  "negro", "blanco", "gris", "crema", "beige", "camel", "marrón", "denim", "azul marino", "plateado", "dorado",
];

export const PATTERNS = ["liso", "rayado", "cuadros", "floral", "lunares", "animal print", "geométrico", "estampado"] as const;
export const STYLES = ["casual", "formal", "deportivo", "elegante", "urbano", "minimalista", "romántico", "bohemio", "clásico", "vintage"] as const;
export const SEASONS = ["verano", "otoño", "invierno", "primavera"] as const;
export const MATERIALS = ["algodón", "denim", "lana", "tejido", "lino", "cuero", "gamuza", "seda", "sintético", "gabardina", "pana", "lona"] as const;
export const FITS = ["ajustado", "regular", "holgado"] as const;
export type Fit = (typeof FITS)[number];

export interface OccasionDef {
  id: string;
  label: string;
  formality: number; // objetivo 1 (muy informal) a 5 (muy formal)
  styles: readonly string[];
}
export const OCCASIONS: readonly OccasionDef[] = [
  { id: "trabajo", label: "Trabajo", formality: 3.5, styles: ["formal", "clásico", "minimalista", "elegante"] },
  { id: "universidad", label: "Universidad", formality: 2, styles: ["casual", "urbano", "minimalista"] },
  { id: "informal", label: "Salida informal", formality: 2.5, styles: ["casual", "urbano", "bohemio"] },
  { id: "cita", label: "Cita", formality: 3.5, styles: ["elegante", "romántico", "minimalista"] },
  { id: "evento", label: "Evento", formality: 4.5, styles: ["elegante", "formal", "clásico"] },
  { id: "fiesta", label: "Fiesta", formality: 4, styles: ["elegante", "urbano", "romántico"] },
  { id: "viaje", label: "Viaje", formality: 1.5, styles: ["casual", "deportivo", "urbano"] },
  { id: "deporte", label: "Actividad deportiva", formality: 1, styles: ["deportivo"] },
];
export const OCCASION_IDS = OCCASIONS.map((o) => o.id);

// ───────────── Contratos compartidos frontend ⇄ backend ─────────────

export interface GarmentAttributes {
  name: string;
  category: Category;
  type: string;
  primary_color: string;
  secondary_colors: string[];
  pattern: string;
  styles: string[];
  seasons: string[];
  material: string | null;
  fit: Fit | null;
  warmth: number; // 1 muy liviana … 5 muy abrigada
  formality: number; // 1 muy informal … 5 muy formal
  waterproof: boolean;
}

export interface ClassificationResult extends GarmentAttributes {
  is_garment: boolean;
  confidence: number;
}

export type WeatherKind = "clear" | "cloudy" | "fog" | "rain" | "storm" | "snow";

export interface WeatherSnapshot {
  provider: string;
  location: { name: string; region: string; country: string; lat: number; lon: number };
  current: {
    tempC: number;
    feelsLikeC: number;
    condition: string;
    kind: WeatherKind;
    isDay: boolean;
    humidity: number;
    windKph: number;
    precipMm: number;
  };
  today: { minC: number; maxC: number; chanceOfRain: number };
  forecast: { date: string; minC: number; maxC: number; chanceOfRain: number; condition: string; kind: WeatherKind }[];
  fetchedAt: string;
  stale?: boolean;
}

export interface PlaceResult {
  name: string;
  region: string;
  country: string;
  lat: number;
  lon: number;
}

/** Contexto climático efectivo que usa el estilismo (clima real o simulado). */
export interface StylingWeather {
  feelsLikeC: number;
  minC: number;
  maxC: number;
  rain: boolean;
  condition: string;
  simulated: boolean;
  /** Falso de noche: no corresponde sugerir anteojos de sol. Si falta, se asume de día. */
  isDay?: boolean;
}

export interface StylistRequest {
  message?: string;
  occasion?: string | null;
  weather?: StylingWeather | null;
  lockedIds?: string[];
  currentIds?: string[];
  excludeIds?: string[];
  conversation?: { role: "user" | "assistant"; text: string }[];
}

export interface StylistResult {
  garmentIds: string[];
  explanation: string;
  occasion: string | null;
  wardrobeGap: string | null;
}
