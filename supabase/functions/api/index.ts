// VESTIA · API backend (Supabase Edge Function "api").
// Un único punto de entrada con rutas delgadas; cada dominio vive en su módulo:
//   weather.ts  → clima (WeatherAPI.com / Open-Meteo)
//   ai.ts       → reconocimiento de prendas y asistente de estilismo (Claude)
//   account.ts  → alta, plan y baja de cuenta
//
// Secrets (Dashboard → Edge Functions → Secrets):
//   WEATHERAPI_KEY     key de https://www.weatherapi.com/ (plan gratuito)
//   ANTHROPIC_API_KEY  key de la API de Claude
//   ANTHROPIC_MODEL    opcional, por defecto claude-opus-5-5

import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import { cancelPlan, deleteAccount, signUp, startTrial } from "./account.ts";
import { aiConfigured, classifyGarment, styleOutfit } from "./ai.ts";
import { corsHeaders, env, HttpError, json, readJson } from "./http.ts";
import { getWeather, searchPlaces } from "./weather.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const admin = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

interface Session {
  userId: string;
  /** Cliente con el token de la persona: todas sus consultas pasan por RLS. */
  db: SupabaseClient;
}

// La función se despliega con verify_jwt=false porque /auth/signup es pública;
// el resto de las rutas valida acá el token de sesión.
async function authenticate(req: Request): Promise<Session> {
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) throw new HttpError(401, "unauthorized", "Iniciá sesión para continuar.");
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) throw new HttpError(401, "unauthorized", "La sesión no es válida.");
  const db = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return { userId: data.user.id, db };
}

async function route(req: Request): Promise<unknown> {
  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/(functions\/v1\/)?api/, "") || "/";
  const key = `${req.method} ${path}`;

  if (key === "POST /auth/signup") return signUp(admin, await readJson(req));

  const session = await authenticate(req);
  switch (key) {
    case "GET /status":
      return { ai: aiConfigured(), weatherProvider: env("WEATHERAPI_KEY") ? "weatherapi" : "open-meteo" };
    case "GET /weather":
      return getWeather(admin, url.searchParams);
    case "GET /weather/search":
      return searchPlaces(url.searchParams);
    case "POST /ai/classify":
      return classifyGarment(admin, session.userId, await readJson(req));
    case "POST /ai/stylist":
      return styleOutfit(admin, session.db, session.userId, await readJson(req));
    case "POST /billing/trial":
      return startTrial(admin, session.userId);
    case "POST /billing/cancel":
      return cancelPlan(admin, session.userId);
    case "DELETE /account":
      return deleteAccount(admin, session.userId);
    default:
      throw new HttpError(404, "not_found", "Ruta inexistente.");
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    return json(await route(req));
  } catch (error) {
    if (error instanceof HttpError) return json({ code: error.code, message: error.message }, error.status);
    console.error("unhandled error", error);
    return json({ code: "internal_error", message: "Ocurrió un error inesperado." }, 500);
  }
});
