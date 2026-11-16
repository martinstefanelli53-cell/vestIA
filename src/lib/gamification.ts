// Gamificación y estadísticas: todo se deriva de datos reales del usuario
// (prendas, outfits y usos registrados). No se guarda estado adicional.
import { CATEGORIES, CATEGORY_LABELS, type Category } from "@shared/taxonomy.ts";
import { dayKey } from "./format";
import type { Garment, Outfit } from "./types";

const DAY = 86_400_000;

function startOfWeek(now: Date): Date {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); // lunes
  return d;
}

// ─────────────────────────────── Racha ───────────────────────────────
export interface Streak {
  days: number;
  activeToday: boolean;
}

export function computeStreak(garments: Garment[], outfits: Outfit[], now = new Date()): Streak {
  const active = new Set<string>();
  garments.forEach((g) => active.add(dayKey(g.created_at)));
  outfits.forEach((o) => {
    active.add(dayKey(o.created_at));
    o.outfit_wears.forEach((w) => active.add(w.worn_on));
  });
  const activeToday = active.has(dayKey(now));
  let days = 0;
  // La racha sigue viva durante el día aunque todavía no haya actividad hoy.
  const cursor = new Date(now.getTime() - (activeToday ? 0 : DAY));
  while (active.has(dayKey(cursor))) {
    days += 1;
    cursor.setTime(cursor.getTime() - DAY);
  }
  return { days, activeToday };
}

// ────────────────────────── Desafío semanal ──────────────────────────
export interface Challenge {
  id: string;
  title: string;
  description: string;
  goal: number;
  progress: number;
  done: boolean;
  daysLeft: number;
}

interface WeekData {
  wornOutfits: number;
  distinctGarmentsWorn: number;
  savedThisWeek: number;
  debuts: number;
}

function weekData(garments: Garment[], outfits: Outfit[], now: Date): WeekData {
  const from = dayKey(startOfWeek(now));
  const wornThisWeek = new Set<string>();
  const wornBefore = new Set<string>();
  let wornOutfits = 0;
  for (const o of outfits) {
    for (const w of o.outfit_wears) {
      const target = w.worn_on >= from ? wornThisWeek : wornBefore;
      if (w.worn_on >= from) wornOutfits += 1;
      o.outfit_items.forEach((i) => target.add(i.garment_id));
    }
  }
  const owned = new Set(garments.map((g) => g.id));
  return {
    wornOutfits,
    distinctGarmentsWorn: [...wornThisWeek].filter((id) => owned.has(id)).length,
    savedThisWeek: outfits.filter((o) => o.is_saved && dayKey(o.created_at) >= from).length,
    debuts: [...wornThisWeek].filter((id) => owned.has(id) && !wornBefore.has(id)).length,
  };
}

const CHALLENGES: { id: string; title: string; description: string; goal: number; progress: (w: WeekData) => number }[] = [
  { id: "usar-3", title: "Tres looks, tres días", description: "Registrá 3 outfits usados esta semana.", goal: 3, progress: (w) => w.wornOutfits },
  { id: "variedad-8", title: "Semana sin repetir", description: "Usá 8 prendas distintas de tu guardarropa.", goal: 8, progress: (w) => w.distinctGarmentsWorn },
  { id: "estrenos-2", title: "Rescate del fondo del placard", description: "Dale uso a 2 prendas que nunca registraste.", goal: 2, progress: (w) => w.debuts },
  { id: "guardar-3", title: "Tu propia curaduría", description: "Guardá 3 outfits nuevos en favoritos.", goal: 3, progress: (w) => w.savedThisWeek },
];

export function weeklyChallenge(garments: Garment[], outfits: Outfit[], now = new Date()): Challenge {
  const monday = startOfWeek(now);
  const weekIndex = Math.floor(monday.getTime() / (7 * DAY));
  const def = CHALLENGES[weekIndex % CHALLENGES.length];
  const progress = Math.min(def.goal, def.progress(weekData(garments, outfits, now)));
  const daysLeft = 7 - Math.floor((now.getTime() - monday.getTime()) / DAY);
  return { id: def.id, title: def.title, description: def.description, goal: def.goal, progress, done: progress >= def.goal, daysLeft };
}

// ───────────────────────────── Estadísticas ─────────────────────────────
export interface WardrobeStats {
  total: number;
  usedLast30: number;
  usageRate: number; // 0..1
  neverWorn: Garment[];
  mostWorn: Garment[];
  forgotten: Garment[]; // usadas alguna vez pero no en los últimos 60 días
  byCategory: { category: Category; label: string; count: number }[];
  outfitsCreated: number;
  outfitsWorn: number;
}

export function wardrobeStats(garments: Garment[], outfits: Outfit[], now = new Date()): WardrobeStats {
  const cutoff30 = dayKey(new Date(now.getTime() - 30 * DAY));
  const cutoff60 = dayKey(new Date(now.getTime() - 60 * DAY));
  const used = garments.filter((g) => g.last_worn_on && g.last_worn_on >= cutoff30);
  return {
    total: garments.length,
    usedLast30: used.length,
    usageRate: garments.length ? used.length / garments.length : 0,
    neverWorn: garments.filter((g) => g.wear_count === 0),
    mostWorn: [...garments].filter((g) => g.wear_count > 0).sort((a, b) => b.wear_count - a.wear_count).slice(0, 5),
    forgotten: garments.filter((g) => g.last_worn_on && g.last_worn_on < cutoff60),
    byCategory: CATEGORIES.map((category) => ({ category, label: CATEGORY_LABELS[category], count: garments.filter((g) => g.category === category).length })),
    outfitsCreated: outfits.length,
    outfitsWorn: outfits.reduce((sum, o) => sum + o.outfit_wears.length, 0),
  };
}

// ──────────────────────────────── Logros ────────────────────────────────
export interface Achievement {
  id: string;
  title: string;
  description: string;
  unlocked: boolean;
  progress: number;
  goal: number;
}

export function achievements(garments: Garment[], outfits: Outfit[], savedLooks: number, now = new Date()): Achievement[] {
  const stats = wardrobeStats(garments, outfits, now);
  const streak = computeStreak(garments, outfits, now).days;
  const saved = outfits.filter((o) => o.is_saved).length;
  const rated = outfits.filter((o) => o.rating !== null).length;
  const reuse = stats.total >= 10 ? Math.round(stats.usageRate * 100) : 0;
  const list: [string, string, string, number, number][] = [
    ["primera-prenda", "Primer paso", "Cargá tu primera prenda.", stats.total, 1],
    ["placard-10", "Guardarropa en marcha", "Digitalizá 10 prendas.", stats.total, 10],
    ["placard-25", "Placard completo", "Digitalizá 25 prendas.", stats.total, 25],
    ["primer-outfit", "Primer look", "Generá tu primer outfit.", stats.outfitsCreated, 1],
    ["outfits-15", "Ojo entrenado", "Generá 15 outfits.", stats.outfitsCreated, 15],
    ["guardados-5", "Curadora", "Guardá 5 outfits en favoritos.", saved, 5],
    ["valoraciones-5", "Con criterio propio", "Valorá 5 recomendaciones.", rated, 5],
    ["usos-10", "Del dicho al hecho", "Registrá 10 outfits usados.", stats.outfitsWorn, 10],
    ["racha-3", "En ritmo", "Usá VESTIA 3 días seguidos.", streak, 3],
    ["racha-7", "Semana perfecta", "Usá VESTIA 7 días seguidos.", streak, 7],
    ["reuso-50", "Placard activo", "Usá la mitad de tus prendas en 30 días (mínimo 10 prendas).", reuse, 50],
    ["inspiracion-3", "Radar de tendencias", "Guardá 3 looks de inspiración.", savedLooks, 3],
  ];
  return list.map(([id, title, description, value, goal]) => ({
    id, title, description, goal, progress: Math.min(value, goal), unlocked: value >= goal,
  }));
}
