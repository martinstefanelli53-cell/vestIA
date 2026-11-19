import type { Category, Fit, GarmentAttributes, StylingWeather } from "@shared/taxonomy.ts";

export interface Profile {
  id: string;
  display_name: string;
  age_range: string | null;
  location_mode: "auto" | "manual";
  location_name: string | null;
  location_region: string | null;
  location_lat: number | null;
  location_lon: number | null;
  styles: string[];
  favorite_colors: string[];
  avoided_colors: string[];
  garment_types: string[];
  occasions: string[];
  comfort_priority: number;
  fit_preference: Fit;
  style_notes: string | null;
  onboarding_completed: boolean;
}

export interface GarmentImage {
  id: string;
  storage_path: string;
  thumb_path: string | null;
  position: number;
}

export interface Garment extends GarmentAttributes {
  id: string;
  user_id: string;
  notes: string | null;
  is_favorite: boolean;
  ai_classified: boolean;
  wear_count: number;
  last_worn_on: string | null;
  created_at: string;
  garment_images: GarmentImage[];
  /** URL firmada de la miniatura de portada (se resuelve al cargar el guardarropa). */
  thumbUrl: string | null;
}

export interface OutfitItem {
  garment_id: string;
  slot: Category;
}

export interface Outfit {
  id: string;
  occasion: string | null;
  request_text: string | null;
  explanation: string | null;
  source: "ai" | "engine";
  weather: StylingWeather | null;
  rain_mode: RainMode;
  is_saved: boolean;
  rating: 1 | -1 | null;
  created_at: string;
  outfit_items: OutfitItem[];
  outfit_wears: { id: string; worn_on: string }[];
}

export type RainMode = "real" | "rain" | "dry";

export interface Plan {
  id: "free" | "premium";
  name: string;
  garment_limit: number;
  daily_outfit_limit: number;
  history_days: number | null;
  features: { advanced_stats: boolean; advanced_personalization: boolean; ads: boolean };
}

export interface Entitlements {
  plan: Plan;
  status: "active" | "trialing" | "canceled" | "expired" | null;
  trial_used: boolean;
  current_period_end: string | null;
  garment_count: number;
  outfits_last_24h: number;
}
