import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Check, Crown, Minus } from "lucide-react";
import { useToast } from "@/components/Toast";
import { Button, ConfirmDialog, cx, PageHeader, Skeleton } from "@/components/ui";
import { useUserId } from "@/hooks/auth";
import { friendlyError, useEntitlements, usePlans } from "@/hooks/data";
import { api } from "@/lib/api";
import { shortDate } from "@/lib/format";
import type { Plan } from "@/lib/types";

type Row = { label: string; free: string | boolean; premium: string | boolean };

/** Comparativa de planes: los límites numéricos salen de la tabla `plans`. */
function comparison(plans: Plan[]): Row[] {
  const free = plans.find((p) => p.id === "free");
  const premium = plans.find((p) => p.id === "premium");
  const history = (p?: Plan) => (p ? (p.history_days ? `Últimos ${p.history_days} días` : "Completo") : "—");
  return [
    { label: "Prendas en tu guardarropa", free: free ? `Hasta ${free.garment_limit}` : "—", premium: premium ? `Hasta ${premium.garment_limit}` : "—" },
    { label: "Outfits generados por día", free: String(free?.daily_outfit_limit ?? "—"), premium: String(premium?.daily_outfit_limit ?? "—") },
    { label: "Reconocimiento de prendas con IA", free: true, premium: true },
    { label: "Clima en tiempo real y selector de lluvia", free: true, premium: true },
    { label: "Feed de inspiración", free: true, premium: true },
    { label: "Racha, desafíos y logros", free: true, premium: true },
    { label: "Historial de outfits", free: history(free), premium: history(premium) },
    { label: "Análisis por prenda: más usadas y olvidadas", free: false, premium: true },
    { label: "Mayor cupo diario del asistente con IA", free: false, premium: true },
    { label: "Experiencia sin promociones", free: false, premium: true },
  ];
}

function Cell({ value, highlight }: { value: string | boolean; highlight?: boolean }) {
  if (value === true) return <Check className={cx("mx-auto h-4 w-4", highlight ? "text-crimson" : "text-ink")} aria-label="Incluido" />;
  if (value === false) return <Minus className="mx-auto h-4 w-4 text-black/25" aria-label="No incluido" />;
  return <span className={cx("text-[13px]", highlight && "font-semibold")}>{value}</span>;
}

export function PremiumPage() {
  const uid = useUserId();
  const { data, isLoading } = useEntitlements();
  const { data: plans } = usePlans();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);

  const premium = data?.plan.id === "premium";
  const trialing = premium && data?.status === "trialing";

  const call = async (path: string, message: string) => {
    setBusy(true);
    try {
      await api(path, { method: "POST" });
      await queryClient.invalidateQueries({ queryKey: ["entitlements", uid] });
      toast(message);
      setCancelOpen(false);
    } catch (e) {
      toast(friendlyError(e), "error");
    } finally {
      setBusy(false);
    }
  };

  if (isLoading || !data) return <><PageHeader title="Planes" /><Skeleton className="h-96" /></>;

  return (
    <div className="space-y-6">
      <PageHeader overline={`Tu plan actual: ${data.plan.name}`} title="VESTIA Premium" />

      <section className="relative overflow-hidden rounded-card bg-ink p-6 text-white sm:p-8">
        <div className="pointer-events-none absolute -right-16 -top-20 h-64 w-64 rounded-full bg-crimson/45 blur-3xl" />
        <Crown className="h-7 w-7 text-white" />
        <h2 className="mt-4 max-w-md text-2xl font-semibold leading-tight sm:text-3xl">
          {premium ? "Tenés Premium activo." : "Todo tu guardarropa, sin límites que te frenen."}
        </h2>
        <p className="mt-2 max-w-md text-sm leading-relaxed text-white/65">
          {trialing && data.current_period_end
            ? `Tu prueba gratuita está activa hasta el ${shortDate(data.current_period_end)}. Después volvés al plan Gratis automáticamente, sin cargos.`
            : premium ? "Disfrutá de más capacidad, más outfits y el análisis completo de tu guardarropa."
            : "Más prendas, más outfits por día, historial completo y el análisis de lo que realmente usás. El plan Gratis sigue siendo tuyo para siempre."}
        </p>
        <div className="relative mt-6 flex flex-wrap items-center gap-3">
          {!premium && !data.trial_used && <Button size="lg" loading={busy} onClick={() => call("/billing/trial", "¡Listo! Ya tenés Premium por 7 días.")}>Probar 7 días gratis</Button>}
          {!premium && data.trial_used && <Button size="lg" disabled>Suscripción paga: próximamente</Button>}
          {premium && <Button variant="outline" className="!border-white/30 !bg-transparent !text-white hover:!border-white" onClick={() => setCancelOpen(true)}>Volver al plan Gratis</Button>}
          <p className="text-xs text-white/50">
            {!premium && !data.trial_used && "Sin tarjeta. Se desactiva sola al terminar."}
            {!premium && data.trial_used && "Ya usaste tu prueba. Te avisaremos en la app cuando se habiliten los pagos."}
          </p>
        </div>
      </section>

      <section className="card overflow-hidden">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-black/[0.06] text-[11px] uppercase tracking-label text-graphite">
              <th className="px-4 py-3.5 font-medium sm:px-6">Qué incluye</th>
              <th className="w-24 px-2 py-3.5 text-center font-medium sm:w-36">Gratis</th>
              <th className="w-24 bg-crimson-soft px-2 py-3.5 text-center font-semibold text-crimson sm:w-36">Premium</th>
            </tr>
          </thead>
          <tbody>
            {comparison(plans ?? []).map((row) => (
              <tr key={row.label} className="border-b border-black/[0.05] last:border-0">
                <th scope="row" className="px-4 py-3.5 text-[13px] font-medium sm:px-6 sm:text-sm">{row.label}</th>
                <td className="px-2 py-3.5 text-center text-graphite"><Cell value={row.free} /></td>
                <td className="bg-crimson-soft/60 px-2 py-3.5 text-center"><Cell value={row.premium} highlight /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <p className="text-xs leading-relaxed text-graphite">
        Uso actual: {data.garment_count} de {data.plan.garment_limit} prendas · {data.outfits_last_24h} de {data.plan.daily_outfit_limit} outfits en las últimas 24 horas.
        En esta primera etapa VESTIA todavía no procesa pagos: la prueba gratuita permite conocer la experiencia Premium completa.
      </p>

      <ConfirmDialog open={cancelOpen} title="Volver al plan Gratis" confirmLabel="Volver a Gratis" loading={busy} onClose={() => setCancelOpen(false)}
        onConfirm={() => call("/billing/cancel", "Volviste al plan Gratis")}
        text="Vas a conservar todas tus prendas y outfits. Si superás los límites del plan Gratis no vas a poder cargar prendas nuevas hasta liberar espacio." />
    </div>
  );
}
