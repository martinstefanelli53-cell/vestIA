// Personalización del feed: ordena los looks según el perfil y la temporada.
import type { Look, Profile } from "./types";

export function lookAffinity(look: Look, profile: Profile | undefined, season: string): number {
  if (!profile) return 0;
  let score = 0;
  if (profile.styles.includes(look.style)) score += 3;
  if (look.occasion && profile.occasions.includes(look.occasion)) score += 2;
  if (look.season === season) score += 2;
  score += look.palette.filter((c) => profile.favorite_colors.includes(c)).length;
  score -= look.palette.filter((c) => profile.avoided_colors.includes(c)).length * 2;
  return score;
}

export function rankLooks(looks: Look[], profile: Profile | undefined, season: string): (Look & { affinity: number })[] {
  return looks
    .map((look) => ({ ...look, affinity: lookAffinity(look, profile, season) }))
    .sort((a, b) => b.affinity - a.affinity || a.sort_order - b.sort_order);
}

export function relatedLooks(look: Look, all: Look[], limit = 3): Look[] {
  return all
    .filter((other) => other.id !== look.id)
    .map((other) => ({ other, score: (other.style === look.style ? 2 : 0) + (other.occasion === look.occasion ? 1 : 0) + other.tags.filter((t) => look.tags.includes(t)).length }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.other);
}

export const KIND_LABELS: Record<Look["kind"], string> = { look: "Look", combinacion: "Combinación", tendencia: "Tendencia" };
