// Servicios de IA (Claude). Aislados del resto del backend: si mañana cambia el
// proveedor o el modelo, solo se modifica este archivo y `prompts.ts`.
// Requiere el secret ANTHROPIC_API_KEY; sin él las rutas responden
// `ai_not_configured` y la app usa su motor de estilismo determinístico.

import Anthropic from "npm:@anthropic-ai/sdk@1.8.0";
import { zodOutputFormat } from "npm:@anthropic-ai/sdk@1.8.0/helpers/zod";
import { z } from "npm:zod@4";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { env, HttpError } from "./http.ts";
import { CLASSIFIER_SYSTEM_PROMPT, STYLIST_SYSTEM_PROMPT } from "./prompts.ts";
import {
  ALL_TYPES, CATEGORIES, COLOR_NAMES, FITS, MATERIALS, OCCASION_IDS, PATTERNS, SEASONS, STYLES, TYPES_BY_CATEGORY,
  type Category, type ClassificationResult, type StylistRequest, type StylistResult,
} from "./taxonomy.ts";

const MODEL = () => env("ANTHROPIC_MODEL") ?? "claude-opus-5-5";
const FALLBACK_BETA = "server-side-fallback-2026-07-01";
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

export const aiConfigured = () => Boolean(env("ANTHROPIC_API_KEY"));

function client(): Anthropic {
  const apiKey = env("ANTHROPIC_API_KEY");
  if (!apiKey) throw new HttpError(503, "ai_not_configured", "El servicio de IA todavía no está configurado.");
  return new Anthropic({ apiKey, timeout: 90_000, maxRetries: 1 });
}

function aiError(error: unknown): HttpError {
  if (error instanceof HttpError) return error;
  console.error("ai request failed", error);
  if (error instanceof Anthropic.AuthenticationError) {
    return new HttpError(503, "ai_not_configured", "La credencial del servicio de IA no es válida.");
  }
  if (error instanceof Anthropic.RateLimitError) {
    return new HttpError(429, "ai_busy", "El servicio de IA está saturado. Probá de nuevo en un momento.");
  }
  return new HttpError(502, "ai_error", "El servicio de IA no pudo responder.");
}

/** Cupo diario por usuario para proteger el costo del servicio de IA. */
async function consumeQuota(admin: SupabaseClient, userId: string, kind: "classify" | "stylist") {
  const { data: plan } = await admin.rpc("plan_for", { uid: userId });
  const premium = plan === "premium";
  const limit = kind === "classify" ? (premium ? 300 : 60) : premium ? 300 : 40;
  const day = new Date().toISOString().slice(0, 10);
  const { data: row } = await admin.from("ai_usage").select("count").match({ user_id: userId, day, kind }).maybeSingle();
  const used = row?.count ?? 0;
  if (used >= limit) throw new HttpError(429, "ai_quota_reached", "Alcanzaste el límite diario de uso de IA.");
  await admin.from("ai_usage").upsert({ user_id: userId, day, kind, count: used + 1 });
}

// ───────────────────── Reconocimiento de prendas ─────────────────────
const ClassificationSchema = z.object({
  is_garment: z.boolean(),
  name: z.string(),
  category: z.enum(CATEGORIES),
  type: z.enum(ALL_TYPES as [string, ...string[]]),
  primary_color: z.enum(COLOR_NAMES as [string, ...string[]]),
  secondary_colors: z.array(z.enum(COLOR_NAMES as [string, ...string[]])),
  pattern: z.enum(PATTERNS),
  styles: z.array(z.enum(STYLES)),
  seasons: z.array(z.enum(SEASONS)),
  material: z.enum(MATERIALS).nullable(),
  fit: z.enum(FITS).nullable(),
  warmth: z.number(),
  formality: z.number(),
  waterproof: z.boolean(),
  confidence: z.number(),
});

const clampLevel = (n: number) => Math.min(5, Math.max(1, Math.round(n)));

export async function classifyGarment(
  admin: SupabaseClient,
  userId: string,
  body: { image?: string; mediaType?: string },
): Promise<ClassificationResult> {
  const mediaType = IMAGE_TYPES.find((t) => t === body.mediaType);
  if (!body.image || !mediaType) throw new HttpError(400, "invalid_image", "Imagen inválida.");
  if (body.image.length > 7_000_000) throw new HttpError(413, "image_too_large", "La imagen es demasiado grande.");
  const anthropic = client();
  await consumeQuota(admin, userId, "classify");

  try {
    const response = await anthropic.beta.messages.parse({
      model: MODEL(),
      max_tokens: 4096,
      betas: [FALLBACK_BETA],
      fallbacks: "default",
      system: CLASSIFIER_SYSTEM_PROMPT,
      output_config: { effort: "low", format: zodOutputFormat(ClassificationSchema) },
      messages: [{
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: mediaType, data: body.image } },
          { type: "text", text: "Clasificá la prenda de esta fotografía." },
        ],
      }],
    });
    const parsed = response.parsed_output;
    if (response.stop_reason === "refusal" || !parsed) {
      throw new HttpError(502, "ai_error", "La IA no pudo analizar esta imagen.");
    }
    // El tipo debe pertenecer a la categoría elegida; si no, se toma el primero válido.
    const category = parsed.category as Category;
    const type = TYPES_BY_CATEGORY[category].includes(parsed.type) ? parsed.type : TYPES_BY_CATEGORY[category][0];
    return {
      ...parsed,
      category,
      type,
      name: parsed.name.slice(0, 60) || type,
      secondary_colors: parsed.secondary_colors.filter((c) => c !== parsed.primary_color).slice(0, 3),
      styles: parsed.styles.slice(0, 3),
      warmth: clampLevel(parsed.warmth),
      formality: clampLevel(parsed.formality),
      confidence: Math.min(1, Math.max(0, parsed.confidence)),
    };
  } catch (error) {
    throw aiError(error);
  }
}

// ───────────────────────── Asistente de estilismo ─────────────────────────
const StylistSchema = z.object({
  garment_refs: z.array(z.string()),
  explanation: z.string(),
  occasion: z.enum(OCCASION_IDS as [string, ...string[]]).nullable(),
  wardrobe_gap: z.string().nullable(),
});

const text = (value: unknown, max: number) => (typeof value === "string" ? value.slice(0, max) : "");
const idList = (value: unknown) => (Array.isArray(value) ? value.filter((v): v is string => typeof v === "string").slice(0, 60) : []);

/**
 * Arma el contexto con datos leídos de la base (con el token de la persona,
 * por lo que rige RLS) y valida que la respuesta solo use prendas reales.
 */
export async function styleOutfit(
  admin: SupabaseClient,
  db: SupabaseClient,
  userId: string,
  body: StylistRequest,
): Promise<StylistResult> {
  const anthropic = client();

  const [profileRes, garmentsRes, outfitsRes] = await Promise.all([
    db.from("profiles").select("display_name, styles, favorite_colors, avoided_colors, garment_types, occasions, comfort_priority, fit_preference, style_notes").eq("id", userId).single(),
    db.from("garments").select("id, name, category, type, primary_color, secondary_colors, pattern, styles, seasons, material, fit, warmth, formality, waterproof, is_favorite, wear_count, last_worn_on").order("created_at"),
    db.from("outfits").select("occasion, rating, created_at, outfit_items(garment_id)").order("created_at", { ascending: false }).limit(12),
  ]);
  if (profileRes.error || garmentsRes.error) throw new HttpError(500, "db_error", "No se pudo leer el guardarropa.");
  const garments = garmentsRes.data ?? [];
  if (garments.length < 2) throw new HttpError(422, "wardrobe_too_small", "Hacen falta más prendas para armar un outfit.");
  await consumeQuota(admin, userId, "stylist");

  // Refs cortas (p1, p2…) en lugar de UUID: menos tokens y menos margen de error.
  const refById = new Map(garments.map((g, i) => [g.id, `p${i + 1}`]));
  const idByRef = new Map(garments.map((g, i) => [`p${i + 1}`, g.id]));
  const toRefs = (ids: unknown) => idList(ids).map((id) => refById.get(id)).filter((r): r is string => Boolean(r));
  const locked = toRefs(body.lockedIds);
  const excluded = toRefs(body.excludeIds);
  const profile = profileRes.data;

  const context = {
    perfil: {
      nombre: profile.display_name,
      estilos_favoritos: profile.styles,
      colores_favoritos: profile.favorite_colors,
      colores_a_evitar: profile.avoided_colors,
      prendas_habituales: profile.garment_types,
      ocasiones_frecuentes: profile.occasions,
      prioridad_comodidad: ["baja", "media", "alta"][profile.comfort_priority - 1],
      calce_preferido: profile.fit_preference,
      notas_de_estilo: profile.style_notes,
    },
    clima: body.weather
      ? {
        sensacion_termica_c: body.weather.feelsLikeC,
        minima_c: body.weather.minC,
        maxima_c: body.weather.maxC,
        lluvia: body.weather.rain,
        condicion: text(body.weather.condition, 60),
        escenario_simulado: body.weather.simulated,
      }
      : "sin datos de clima",
    ocasion_seleccionada: OCCASION_IDS.includes(body.occasion ?? "") ? body.occasion : null,
    guardarropa: garments.map((g) => ({
      ref: refById.get(g.id),
      nombre: g.name,
      categoria: g.category,
      tipo: g.type,
      color: g.primary_color,
      colores_secundarios: g.secondary_colors,
      estampado: g.pattern,
      estilos: g.styles,
      estaciones: g.seasons,
      material: g.material,
      calce: g.fit,
      abrigo: g.warmth,
      formalidad: g.formality,
      impermeable: g.waterproof,
      favorita: g.is_favorite,
      usos: g.wear_count,
      ultimo_uso: g.last_worn_on,
    })),
    outfits_recientes: (outfitsRes.data ?? []).map((o) => ({
      prendas: toRefs(o.outfit_items.map((i: { garment_id: string }) => i.garment_id)),
      ocasion: o.occasion,
      valoracion: o.rating === 1 ? "le gustó" : o.rating === -1 ? "no le gustó" : "sin valorar",
    })),
    outfit_actual: toRefs(body.currentIds),
    fijadas: locked,
    excluidas: excluded,
    conversacion_previa: (Array.isArray(body.conversation) ? body.conversation : []).slice(-6).map((m) => ({
      quien: m.role === "user" ? "persona" : "estilista",
      texto: text(m.text, 400),
    })),
    pedido: text(body.message, 500) || null,
  };

  try {
    const response = await anthropic.beta.messages.parse({
      model: MODEL(),
      max_tokens: 8192,
      betas: [FALLBACK_BETA],
      fallbacks: "default",
      system: STYLIST_SYSTEM_PROMPT,
      output_config: { effort: "low", format: zodOutputFormat(StylistSchema) },
      messages: [{ role: "user", content: JSON.stringify(context) }],
    });
    const parsed = response.parsed_output;
    if (response.stop_reason === "refusal" || !parsed) {
      throw new HttpError(502, "ai_error", "La IA no pudo armar el outfit.");
    }

    // Validación dura: nada de prendas inventadas, repetidas, excluidas o sin las fijadas.
    const refs = [...new Set(parsed.garment_refs)];
    const valid = refs.length >= 1 &&
      refs.every((r) => idByRef.has(r) && !excluded.includes(r)) &&
      locked.every((r) => refs.includes(r));
    if (!valid) throw new HttpError(422, "ai_invalid_outfit", "La IA devolvió un outfit inválido.");

    return {
      garmentIds: refs.map((r) => idByRef.get(r)!),
      explanation: parsed.explanation.trim(),
      occasion: parsed.occasion,
      wardrobeGap: parsed.wardrobe_gap?.trim() || null,
    };
  } catch (error) {
    throw aiError(error);
  }
}
