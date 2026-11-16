// Orquestador del asistente de estilismo.
// 1) Si el servicio de IA está disponible, la estilista (Claude) elige el outfit
//    y el motor valida que la estructura sea correcta.
// 2) Si no lo está o falla, el motor determinístico resuelve el pedido con el
//    intérprete de reglas. En ambos casos solo se usan prendas reales.
import type { StylingWeather, StylistResult } from "@shared/taxonomy.ts";
import { api, ApiError, UserError } from "@/lib/api";
import type { Garment, Outfit, Profile } from "@/lib/types";
import { evaluateOutfit, isValidOutfit, missingForOutfit, pickOutfit, replaceGarment, sortBySlot, type EngineInput, type Intent } from "./engine";
import { explainOutfit } from "./explain";
import { parseIntent } from "./intent";

export interface StyleRequest {
  garments: Garment[];
  profile: Profile;
  weather: StylingWeather | null;
  season: string;
  occasion: string | null;
  message?: string;
  history: Outfit[];
  lockedIds?: string[];
  excludeIds?: string[];
  currentItems?: Garment[];
  conversation?: { role: "user" | "assistant"; text: string }[];
  useAi: boolean;
}

export interface StyledOutfit {
  items: Garment[];
  explanation: string;
  source: "ai" | "engine";
  occasion: string | null;
  gap: string | null;
}

export class StylingError extends UserError {}

function engineInput(req: StyleRequest, intent: Intent): EngineInput {
  return {
    garments: req.garments,
    profile: req.profile,
    weather: req.weather,
    season: req.season,
    intent,
    history: req.history.map((o) => ({ ids: o.outfit_items.map((i) => i.garment_id), rating: o.rating })),
    lockedIds: req.lockedIds,
    excludeIds: req.excludeIds,
    currentIds: req.currentItems?.map((g) => g.id),
  };
}

function buildIntent(req: StyleRequest): Intent {
  const intent = parseIntent(req.message, req.garments);
  // Lo que la persona escribe pesa más que la ocasión preseleccionada.
  return { ...intent, occasion: intent.occasion ?? req.occasion };
}

/** Devuelve `aiUnavailable` cuando el backend informa que la IA no está configurada. */
export async function styleOutfit(req: StyleRequest): Promise<StyledOutfit & { aiUnavailable?: boolean }> {
  const missing = missingForOutfit(req.garments);
  if (missing) throw new StylingError(missing);
  const intent = buildIntent(req);
  let aiUnavailable = false;

  if (req.useAi) {
    try {
      const result = await api<StylistResult>("/ai/stylist", {
        body: {
          message: req.message,
          occasion: req.occasion,
          weather: req.weather,
          lockedIds: req.lockedIds,
          excludeIds: req.excludeIds,
          currentIds: req.currentItems?.map((g) => g.id),
          conversation: req.conversation,
        },
      });
      const items = result.garmentIds.map((id) => req.garments.find((g) => g.id === id)).filter((g): g is Garment => Boolean(g));
      if (isValidOutfit(items)) {
        return {
          items: sortBySlot(items),
          explanation: result.explanation,
          source: "ai",
          occasion: result.occasion ?? intent.occasion,
          gap: result.wardrobeGap,
        };
      }
    } catch (error) {
      if (error instanceof ApiError && error.code === "ai_not_configured") aiUnavailable = true;
      // Cualquier otro error (red, cupo, respuesta inválida) cae al motor sin interrumpir a la persona.
    }
  }

  const input = engineInput(req, intent);
  const candidate = pickOutfit(input);
  if (!candidate) throw new StylingError("No encontré una combinación posible con esas condiciones. Probá con otro pedido.");
  return {
    items: candidate.items,
    explanation: explainOutfit(candidate, req.weather, intent),
    source: "engine",
    occasion: intent.occasion,
    gap: null,
    aiUnavailable,
  };
}

/** Cambia una sola prenda y conserva el resto del outfit. */
export function swapGarment(req: StyleRequest, garmentId: string): StyledOutfit | null {
  if (!req.currentItems) return null;
  const intent = buildIntent({ ...req, message: undefined });
  const input = engineInput(req, intent);
  const candidate = replaceGarment(input, req.currentItems, garmentId);
  if (!candidate) return null;
  return {
    items: candidate.items,
    explanation: explainOutfit(evaluateOutfit(input, candidate.items), req.weather, intent),
    source: "engine",
    occasion: intent.occasion,
    gap: null,
  };
}
