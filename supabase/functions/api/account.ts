// Operaciones de cuenta que requieren privilegios de servidor (service role):
// alta de usuarios, plan/suscripción y baja de la cuenta.

import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { HttpError } from "./http.ts";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const TRIAL_DAYS = 7;

/**
 * Alta con email y contraseña. El MVP confirma el email automáticamente porque
 * el proyecto aún no tiene SMTP propio; al configurarlo, reemplazar por
 * `supabase.auth.signUp` en el cliente para exigir verificación.
 */
export async function signUp(admin: SupabaseClient, body: { email?: string; password?: string; displayName?: string }) {
  const email = (body.email ?? "").trim().toLowerCase();
  const password = body.password ?? "";
  const displayName = (body.displayName ?? "").trim().slice(0, 60);
  if (!EMAIL_RE.test(email) || email.length > 254) throw new HttpError(400, "invalid_email", "Ingresá un email válido.");
  if (password.length < 8 || password.length > 72) throw new HttpError(400, "weak_password", "La contraseña debe tener entre 8 y 72 caracteres.");
  if (!displayName) throw new HttpError(400, "invalid_name", "Ingresá tu nombre.");

  const { error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { display_name: displayName },
  });
  if (error) {
    if (error.status === 422 || /already/i.test(error.message)) {
      throw new HttpError(409, "email_taken", "Ya existe una cuenta con ese email.");
    }
    console.error("signup failed", error);
    throw new HttpError(500, "signup_failed", "No se pudo crear la cuenta.");
  }
  return { ok: true };
}

// ─────────────────────────── Plan y suscripción ───────────────────────────
// Punto de extensión para la pasarela de pagos: el webhook del proveedor
// (Mercado Pago, Stripe…) debe actualizar `subscriptions` igual que estas
// funciones, completando provider / provider_customer_id / provider_subscription_id.

export async function startTrial(admin: SupabaseClient, userId: string) {
  const { data: sub } = await admin.from("subscriptions").select("trial_used, plan_id, status, current_period_end").eq("user_id", userId).single();
  if (!sub) throw new HttpError(404, "subscription_missing", "No se encontró la suscripción.");
  if (sub.trial_used) throw new HttpError(409, "trial_used", "Ya usaste tu prueba gratuita de Premium.");
  const end = new Date(Date.now() + TRIAL_DAYS * 86_400_000).toISOString();
  const { error } = await admin.from("subscriptions")
    .update({ plan_id: "premium", status: "trialing", trial_used: true, current_period_end: end })
    .eq("user_id", userId);
  if (error) throw new HttpError(500, "db_error", "No se pudo activar la prueba.");
  return { ok: true, current_period_end: end };
}

export async function cancelPlan(admin: SupabaseClient, userId: string) {
  const { error } = await admin.from("subscriptions")
    .update({ plan_id: "free", status: "active", current_period_end: null })
    .eq("user_id", userId);
  if (error) throw new HttpError(500, "db_error", "No se pudo cambiar el plan.");
  return { ok: true };
}

/** Baja definitiva: borra las fotos del storage y luego el usuario (cascada en la base). */
export async function deleteAccount(admin: SupabaseClient, userId: string) {
  const { data: images } = await admin.from("garment_images").select("storage_path, thumb_path").eq("user_id", userId);
  const paths = (images ?? []).flatMap((i) => [i.storage_path, i.thumb_path]).filter((p): p is string => Boolean(p));
  for (let i = 0; i < paths.length; i += 100) {
    await admin.storage.from("garments").remove(paths.slice(i, i + 100));
  }
  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) {
    console.error("delete account failed", error);
    throw new HttpError(500, "delete_failed", "No se pudo eliminar la cuenta.");
  }
  return { ok: true };
}
