// Cliente del backend (Edge Function "api"). Toda integración con servicios
// externos (clima, IA) y toda operación privilegiada pasa por acá.
import { supabase, SUPABASE_URL } from "./supabase";

/** Error cuyo mensaje ya está redactado para mostrarse a la persona. */
export class UserError extends Error {}

export class ApiError extends UserError {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

const BASE = `${SUPABASE_URL}/functions/v1/api`;

export async function api<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const headers: Record<string, string> = {
    apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
    "Content-Type": "application/json",
  };
  if (data.session) headers.Authorization = `Bearer ${data.session.access_token}`;

  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      method: init.method ?? (init.body ? "POST" : "GET"),
      headers,
      body: init.body ? JSON.stringify(init.body) : undefined,
    });
  } catch {
    throw new ApiError(0, "network", "Sin conexión. Revisá tu internet e intentá de nuevo.");
  }
  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    throw new ApiError(res.status, payload?.code ?? "unknown", payload?.message ?? "Ocurrió un error inesperado.");
  }
  return payload as T;
}
