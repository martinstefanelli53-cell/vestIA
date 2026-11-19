import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { ChevronRight, Crown, LogOut, MapPin, Trash2 } from "lucide-react";
import { COLOR_NAMES, FITS, OCCASIONS, STYLES, TYPES_BY_CATEGORY, type Fit } from "@shared/taxonomy.ts";
import { useToast } from "@/components/Toast";
import { Button, ChipGroup, ColorPicker, ConfirmDialog, Field, PageHeader, Segmented, Skeleton } from "@/components/ui";
import { LocationSheet } from "@/components/Weather";
import { useAuth } from "@/hooks/auth";
import { friendlyError, purgeInspirationFiles, useEntitlements, useProfile, useUpdateProfile } from "@/hooks/data";
import { useWeather } from "@/hooks/weather";
import { api } from "@/lib/api";
import { capitalize } from "@/lib/format";
import { supabase } from "@/lib/supabase";
import type { Profile } from "@/lib/types";

type Editable = Pick<Profile, "display_name" | "age_range" | "styles" | "favorite_colors" | "avoided_colors" | "garment_types" | "occasions" | "comfort_priority" | "fit_preference" | "style_notes">;
const AGE_RANGES = ["18-24", "25-34", "35-44", "45 o más"];
const HABITUAL_TYPES = [...TYPES_BY_CATEGORY.top, ...TYPES_BY_CATEGORY.bottom, ...TYPES_BY_CATEGORY.dress, ...TYPES_BY_CATEGORY.outerwear, ...TYPES_BY_CATEGORY.shoes];

const pick = (p: Profile): Editable => ({
  display_name: p.display_name, age_range: p.age_range, styles: p.styles, favorite_colors: p.favorite_colors, avoided_colors: p.avoided_colors,
  garment_types: p.garment_types, occasions: p.occasions, comfort_priority: p.comfort_priority, fit_preference: p.fit_preference, style_notes: p.style_notes,
});

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="card p-5 sm:p-6">
      <h2 className="text-base font-semibold">{title}</h2>
      {description && <p className="mt-1 text-[13px] leading-relaxed text-graphite">{description}</p>}
      <div className="mt-5 space-y-6">{children}</div>
    </section>
  );
}

export function ProfilePage() {
  const { data: profile, isLoading } = useProfile();
  const { data: entitlements } = useEntitlements();
  const { snapshot } = useWeather();
  const { email, signOut } = useAuth();
  const update = useUpdateProfile();
  const toast = useToast();
  const queryClient = useQueryClient();

  const [form, setForm] = useState<Editable | null>(null);
  const [locationOpen, setLocationOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => { if (profile && !form) setForm(pick(profile)); }, [profile, form]);
  const dirty = useMemo(() => Boolean(profile && form && JSON.stringify(pick(profile)) !== JSON.stringify(form)), [profile, form]);
  const set = <K extends keyof Editable>(key: K, value: Editable[K]) => setForm((f) => (f ? { ...f, [key]: value } : f));

  if (isLoading || !profile || !form) return <><PageHeader title="Perfil" /><Skeleton className="h-96" /></>;

  const save = async () => {
    if (!form.display_name.trim()) { toast("Ingresá tu nombre.", "error"); return; }
    try {
      const saved = await update.mutateAsync({ ...form, display_name: form.display_name.trim(), style_notes: form.style_notes?.trim() || null });
      setForm(pick(saved));
      toast("Preferencias guardadas");
    } catch (e) {
      toast(friendlyError(e), "error");
    }
  };

  const changePassword = async (event: FormEvent) => {
    event.preventDefault();
    setSavingPassword(true);
    const { error } = await supabase.auth.updateUser({ password });
    setSavingPassword(false);
    if (error) toast(error.message.includes("different") ? "La contraseña nueva debe ser distinta de la actual." : "No se pudo cambiar la contraseña.", "error");
    else { setPassword(""); toast("Contraseña actualizada"); }
  };

  const deleteAccount = async () => {
    setDeleting(true);
    try {
      // Las fotos de "Mi inspiración" se borran primero: el servidor solo conoce las de prendas.
      await purgeInspirationFiles(profile.id).catch(() => undefined);
      await api("/account", { method: "DELETE" });
      queryClient.clear();
      await signOut();
    } catch (e) {
      toast(friendlyError(e), "error");
      setDeleting(false);
    }
  };

  const locationName = profile.location_name ?? (profile.location_lat !== null ? snapshot?.location.name ?? "Ubicación detectada" : "Sin definir");
  const premium = entitlements?.plan.id === "premium";

  return (
    <div className="space-y-5 pb-20">
      <PageHeader overline={email ?? undefined} title="Perfil" />

      <Section title="Datos personales">
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Nombre"><input className="field" value={form.display_name} maxLength={60} onChange={(e) => set("display_name", e.target.value)} /></Field>
          <Field label="Edad" hint="Opcional">
            <select className="field" value={form.age_range ?? ""} onChange={(e) => set("age_range", e.target.value || null)}>
              <option value="">Prefiero no decirlo</option>
              {AGE_RANGES.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </Field>
        </div>
        <button type="button" onClick={() => setLocationOpen(true)} className="flex w-full items-center gap-3 rounded-xl border border-black/10 px-4 py-3 text-left transition-colors hover:border-ink">
          <MapPin className="h-5 w-5 shrink-0 text-crimson" />
          <span className="min-w-0 flex-1">
            <span className="block text-[13px] font-medium">Ubicación para el clima</span>
            <span className="block truncate text-xs text-graphite">{locationName} · {profile.location_mode === "manual" ? "elegida manualmente" : "detección automática"}</span>
          </span>
          <ChevronRight className="h-4 w-4 text-graphite" />
        </button>
      </Section>

      <Section title="Tu estilo" description="Tu estilista usa estas preferencias en cada outfit y para ordenar la inspiración.">
        <div><p className="mb-2.5 flex items-baseline justify-between text-[13px] font-medium">Estilos favoritos <span className="text-xs font-normal text-graphite">Hasta 4</span></p>
          <ChipGroup options={STYLES} value={form.styles as (typeof STYLES)[number][]} onChange={(v) => set("styles", v)} max={4} /></div>
        <div><p className="mb-2.5 flex items-baseline justify-between text-[13px] font-medium">Colores preferidos <span className="text-xs font-normal text-graphite">Hasta 6</span></p>
          <ColorPicker options={COLOR_NAMES.filter((c) => !form.avoided_colors.includes(c))} value={form.favorite_colors} onChange={(v) => set("favorite_colors", v)} multiple max={6} /></div>
        <div><p className="mb-2.5 flex items-baseline justify-between text-[13px] font-medium">Colores que preferís evitar <span className="text-xs font-normal text-graphite">Hasta 6</span></p>
          <ColorPicker options={COLOR_NAMES.filter((c) => !form.favorite_colors.includes(c))} value={form.avoided_colors} onChange={(v) => set("avoided_colors", v)} multiple max={6} /></div>
        <div><p className="mb-2.5 text-[13px] font-medium">Ocasiones más frecuentes</p>
          <ChipGroup options={OCCASIONS.map((o) => o.id)} value={form.occasions} onChange={(v) => set("occasions", v)} label={(id) => OCCASIONS.find((o) => o.id === id)!.label} /></div>
        <div><p className="mb-2.5 text-[13px] font-medium">Prendas que usás habitualmente</p>
          <ChipGroup options={HABITUAL_TYPES} value={form.garment_types} onChange={(v) => set("garment_types", v)} /></div>
      </Section>

      <Section title="Comodidad y calce">
        <Field label="¿Qué priorizás al vestirte?">
          <Segmented ariaLabel="Prioridad de comodidad" value={form.comfort_priority} onChange={(v) => set("comfort_priority", v)}
            options={[{ value: 1, label: "Estilo" }, { value: 2, label: "Equilibrio" }, { value: 3, label: "Comodidad" }]} />
        </Field>
        <Field label="Calce preferido">
          <Segmented ariaLabel="Calce preferido" value={form.fit_preference} onChange={(v) => set("fit_preference", v as Fit)} options={FITS.map((f) => ({ value: f, label: capitalize(f) }))} />
        </Field>
        <Field label="Notas para tu estilista" hint={`${form.style_notes?.length ?? 0}/500`}>
          <textarea className="field min-h-24 resize-none" maxLength={500} value={form.style_notes ?? ""} placeholder="Ej.: no uso tacos; prefiero no mostrar los hombros; para el trabajo necesito zapato cerrado."
            onChange={(e) => set("style_notes", e.target.value)} />
        </Field>
      </Section>

      <Section title="Plan">
        <Link to="/premium" className="flex items-center gap-3 rounded-xl border border-black/10 px-4 py-3 transition-colors hover:border-ink">
          <Crown className="h-5 w-5 shrink-0 text-crimson" />
          <span className="min-w-0 flex-1">
            <span className="block text-[13px] font-medium">Plan {entitlements?.plan.name ?? "Gratis"}{entitlements?.status === "trialing" ? " · prueba gratuita" : ""}</span>
            <span className="block text-xs text-graphite">
              {entitlements ? `${entitlements.garment_count} de ${entitlements.plan.garment_limit} prendas · ${entitlements.outfits_last_24h} de ${entitlements.plan.daily_outfit_limit} outfits hoy` : "Cargando…"}
            </span>
          </span>
          <span className="text-[13px] font-medium text-crimson">{premium ? "Gestionar" : "Ver Premium"}</span>
        </Link>
      </Section>

      <Section title="Cuenta y privacidad" description="Tus fotos y preferencias son privadas: solo vos podés verlas.">
        <form onSubmit={changePassword} className="flex items-end gap-2">
          <div className="flex-1"><Field label="Cambiar contraseña" hint="Mínimo 8 caracteres">
            <input className="field" type="password" autoComplete="new-password" minLength={8} value={password} placeholder="Contraseña nueva" onChange={(e) => setPassword(e.target.value)} />
          </Field></div>
          <Button type="submit" variant="outline" loading={savingPassword} disabled={password.length < 8}>Actualizar</Button>
        </form>
        <div className="flex flex-wrap gap-2 border-t border-black/[0.06] pt-5">
          <Button variant="outline" onClick={signOut} icon={<LogOut className="h-4 w-4" />}>Cerrar sesión</Button>
          <Button variant="danger" onClick={() => setDeleteOpen(true)} icon={<Trash2 className="h-4 w-4" />}>Eliminar mi cuenta</Button>
        </div>
      </Section>

      {dirty && (
        <div className="fixed inset-x-0 bottom-[5.5rem] z-20 flex justify-center px-4 md:bottom-6 md:pl-60">
          <div className="flex w-full max-w-md items-center gap-3 rounded-full bg-ink py-2 pl-5 pr-2 text-white shadow-lift animate-fade-up">
            <span className="flex-1 text-[13px] font-medium">Tenés cambios sin guardar</span>
            <button type="button" onClick={() => setForm(pick(profile))} className="px-2 text-[13px] text-white/70 hover:text-white">Descartar</button>
            <Button size="sm" loading={update.isPending} onClick={save}>Guardar</Button>
          </div>
        </div>
      )}

      <LocationSheet open={locationOpen} onClose={() => setLocationOpen(false)} />
      <ConfirmDialog open={deleteOpen} title="Eliminar mi cuenta" confirmLabel="Eliminar definitivamente" loading={deleting} onConfirm={deleteAccount} onClose={() => setDeleteOpen(false)}
        text="Se van a borrar de forma permanente tu perfil, tus prendas con sus fotos, tus outfits y tu historial. Esta acción no se puede deshacer." />
    </div>
  );
}
