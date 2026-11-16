// Servicio de clima. Cada proveedor implementa `WeatherProvider` y devuelve el
// mismo `WeatherSnapshot`, así cambiar de proveedor no toca el resto de la app.
//   · WeatherAPI.com → proveedor principal (requiere el secret WEATHERAPI_KEY).
//   · Open-Meteo     → respaldo sin credenciales mientras no haya key configurada.

import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { env, HttpError } from "./http.ts";
import type { PlaceResult, WeatherKind, WeatherSnapshot } from "./taxonomy.ts";

interface WeatherProvider {
  id: string;
  forecast(lat: number, lon: number, nameHint?: string): Promise<WeatherSnapshot>;
  search(query: string): Promise<PlaceResult[]>;
}

const CACHE_TTL_MS = 15 * 60 * 1000;
const round1 = (n: number) => Math.round(n * 10) / 10;

async function getJson(url: string): Promise<any> {
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`weather provider responded ${res.status}`);
  return res.json();
}

// ───────────────────────────── WeatherAPI.com ─────────────────────────────
function weatherApiKind(code: number): WeatherKind {
  if (code === 1000) return "clear";
  if ([1003, 1006, 1009].includes(code)) return "cloudy";
  if ([1030, 1135, 1147].includes(code)) return "fog";
  if ([1087, 1273, 1276, 1279, 1282].includes(code)) return "storm";
  if ([1066, 1069, 1114, 1117, 1204, 1207, 1210, 1213, 1216, 1219, 1222, 1225, 1237, 1249, 1252, 1255, 1258, 1261, 1264].includes(code)) return "snow";
  return "rain";
}

function weatherApiProvider(key: string): WeatherProvider {
  const base = "https://api.weatherapi.com/v1";
  return {
    id: "weatherapi",
    async forecast(lat, lon) {
      const d = await getJson(`${base}/forecast.json?key=${key}&q=${lat},${lon}&days=3&lang=es&aqi=no&alerts=no`);
      const days = d.forecast.forecastday as any[];
      return {
        provider: "weatherapi",
        location: { name: d.location.name, region: d.location.region, country: d.location.country, lat: d.location.lat, lon: d.location.lon },
        current: {
          tempC: round1(d.current.temp_c),
          feelsLikeC: round1(d.current.feelslike_c),
          condition: d.current.condition.text,
          kind: weatherApiKind(d.current.condition.code),
          isDay: d.current.is_day === 1,
          humidity: d.current.humidity,
          windKph: round1(d.current.wind_kph),
          precipMm: d.current.precip_mm,
        },
        today: { minC: round1(days[0].day.mintemp_c), maxC: round1(days[0].day.maxtemp_c), chanceOfRain: days[0].day.daily_chance_of_rain },
        forecast: days.map((f) => ({
          date: f.date,
          minC: round1(f.day.mintemp_c),
          maxC: round1(f.day.maxtemp_c),
          chanceOfRain: f.day.daily_chance_of_rain,
          condition: f.day.condition.text,
          kind: weatherApiKind(f.day.condition.code),
        })),
        fetchedAt: new Date().toISOString(),
      };
    },
    async search(query) {
      const d = await getJson(`${base}/search.json?key=${key}&q=${encodeURIComponent(query)}`);
      return (d as any[]).slice(0, 6).map((p) => ({ name: p.name, region: p.region, country: p.country, lat: p.lat, lon: p.lon }));
    },
  };
}

// ─────────────────────────────── Open-Meteo ───────────────────────────────
function wmo(code: number): { text: string; kind: WeatherKind } {
  if (code === 0) return { text: "Despejado", kind: "clear" };
  if (code <= 2) return { text: "Parcialmente nublado", kind: "cloudy" };
  if (code === 3) return { text: "Nublado", kind: "cloudy" };
  if (code === 45 || code === 48) return { text: "Niebla", kind: "fog" };
  if (code >= 51 && code <= 57) return { text: "Llovizna", kind: "rain" };
  if (code >= 61 && code <= 67) return { text: "Lluvia", kind: "rain" };
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return { text: "Nieve", kind: "snow" };
  if (code >= 80 && code <= 82) return { text: "Chaparrones", kind: "rain" };
  if (code >= 95) return { text: "Tormenta", kind: "storm" };
  return { text: "Variable", kind: "cloudy" };
}

const openMeteoProvider: WeatherProvider = {
  id: "open-meteo",
  async forecast(lat, lon, nameHint) {
    const d = await getJson(
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
        "&current=temperature_2m,apparent_temperature,relative_humidity_2m,is_day,precipitation,weather_code,wind_speed_10m" +
        "&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&forecast_days=3&timezone=auto",
    );
    const now = wmo(d.current.weather_code);
    const daily = d.daily;
    return {
      provider: "open-meteo",
      location: { name: nameHint || "Tu ubicación", region: "", country: "", lat, lon },
      current: {
        tempC: round1(d.current.temperature_2m),
        feelsLikeC: round1(d.current.apparent_temperature),
        condition: now.text,
        kind: now.kind,
        isDay: d.current.is_day === 1,
        humidity: d.current.relative_humidity_2m,
        windKph: round1(d.current.wind_speed_10m),
        precipMm: d.current.precipitation,
      },
      today: { minC: round1(daily.temperature_2m_min[0]), maxC: round1(daily.temperature_2m_max[0]), chanceOfRain: daily.precipitation_probability_max[0] ?? 0 },
      forecast: (daily.time as string[]).map((date, i) => ({
        date,
        minC: round1(daily.temperature_2m_min[i]),
        maxC: round1(daily.temperature_2m_max[i]),
        chanceOfRain: daily.precipitation_probability_max[i] ?? 0,
        condition: wmo(daily.weather_code[i]).text,
        kind: wmo(daily.weather_code[i]).kind,
      })),
      fetchedAt: new Date().toISOString(),
    };
  },
  async search(query) {
    const d = await getJson(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=6&language=es`);
    return ((d.results ?? []) as any[]).map((p) => ({ name: p.name, region: p.admin1 ?? "", country: p.country ?? "", lat: p.latitude, lon: p.longitude }));
  },
};

function activeProvider(): WeatherProvider {
  const key = env("WEATHERAPI_KEY");
  return key ? weatherApiProvider(key) : openMeteoProvider;
}

function parseCoord(value: string | null, max: number): number {
  const n = Number(value);
  if (value === null || value === "" || !Number.isFinite(n) || Math.abs(n) > max) {
    throw new HttpError(400, "invalid_location", "Ubicación inválida.");
  }
  return n;
}

export async function getWeather(admin: SupabaseClient, params: URLSearchParams): Promise<WeatherSnapshot> {
  const lat = parseCoord(params.get("lat"), 90);
  const lon = parseCoord(params.get("lon"), 180);
  const nameHint = (params.get("name") ?? "").slice(0, 80);
  const provider = activeProvider();
  // ~1 km de precisión: usuarios cercanos comparten caché y se evitan llamadas repetidas.
  const cacheKey = `${provider.id}:${lat.toFixed(2)},${lon.toFixed(2)}`;

  const { data: cached } = await admin.from("weather_cache").select("payload, fetched_at").eq("cache_key", cacheKey).maybeSingle();
  if (cached && Date.now() - new Date(cached.fetched_at).getTime() < CACHE_TTL_MS) {
    return cached.payload as WeatherSnapshot;
  }
  try {
    const snapshot = await provider.forecast(lat, lon, nameHint);
    await admin.from("weather_cache").upsert({ cache_key: cacheKey, payload: snapshot, fetched_at: snapshot.fetchedAt });
    return snapshot;
  } catch (error) {
    console.error("weather fetch failed", error);
    // Si el proveedor falla, se sirve el último dato conocido marcado como desactualizado.
    if (cached) return { ...(cached.payload as WeatherSnapshot), stale: true };
    throw new HttpError(502, "weather_unavailable", "No se pudo obtener el clima en este momento.");
  }
}

export async function searchPlaces(params: URLSearchParams): Promise<PlaceResult[]> {
  const query = (params.get("q") ?? "").trim().slice(0, 80);
  if (query.length < 2) return [];
  try {
    return await activeProvider().search(query);
  } catch (error) {
    console.error("place search failed", error);
    throw new HttpError(502, "weather_unavailable", "No se pudo buscar la ciudad en este momento.");
  }
}
