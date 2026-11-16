import { useMemo } from "react";
import { Link } from "react-router-dom";
import { Award, Check, Crown, Flame, Lock, Target } from "lucide-react";
import { GarmentThumb } from "@/components/Garment";
import { cx, EmptyState, PageHeader, ProgressBar, SectionTitle, Skeleton, Button } from "@/components/ui";
import { useEntitlements, useGarments, useLooks, useOutfits } from "@/hooks/data";
import { achievements, computeStreak, wardrobeStats, weeklyChallenge } from "@/lib/gamification";
import type { Garment } from "@/lib/types";

function GarmentRow({ title, empty, items, caption }: { title: string; empty: string; items: Garment[]; caption: (g: Garment) => string }) {
  return (
    <div>
      <h3 className="mb-2.5 text-[13px] font-semibold">{title}</h3>
      {items.length === 0 ? <p className="text-sm text-graphite">{empty}</p> : (
        <div className="no-scrollbar flex gap-3 overflow-x-auto">
          {items.slice(0, 8).map((g) => (
            <Link key={g.id} to={`/outfit?auto=1&prenda=${g.id}`} className="w-20 shrink-0 transition-transform active:scale-95" title={`Armar outfit con ${g.name}`}>
              <GarmentThumb garment={g} className="!rounded-lg" />
              <p className="mt-1 truncate text-[11px] font-medium">{g.name}</p>
              <p className="text-[11px] text-graphite">{caption(g)}</p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export function ProgressPage() {
  const { data: garments, isLoading } = useGarments();
  const { data: outfits } = useOutfits();
  const { data: looks } = useLooks();
  const { data: entitlements } = useEntitlements();

  const list = garments ?? [];
  const history = outfits ?? [];
  const stats = useMemo(() => wardrobeStats(list, history), [list, history]);
  const streak = useMemo(() => computeStreak(list, history), [list, history]);
  const challenge = useMemo(() => weeklyChallenge(list, history), [list, history]);
  const badges = useMemo(() => achievements(list, history, looks?.savedIds.length ?? 0), [list, history, looks]);
  const advanced = entitlements?.plan.features.advanced_stats ?? false;
  const unlocked = badges.filter((b) => b.unlocked).length;
  const maxCategory = Math.max(1, ...stats.byCategory.map((c) => c.count));

  if (isLoading) return <><PageHeader title="Mi progreso" /><Skeleton className="h-64" /></>;
  if (list.length === 0) {
    return (
      <>
        <PageHeader overline="Hábitos y estadísticas" title="Mi progreso" />
        <EmptyState icon={<Award className="h-5 w-5" />} title="Tu progreso empieza con la primera prenda" text="Cargá tu guardarropa y vas a ver acá tu racha, tus desafíos y cuánto aprovechás tu ropa."
          action={<Link to="/guardarropa?nueva=1"><Button>Cargar una prenda</Button></Link>} />
      </>
    );
  }

  return (
    <div className="space-y-8">
      <PageHeader overline="Hábitos y estadísticas" title="Mi progreso" />

      <div className="-mt-2 grid gap-4 sm:grid-cols-2">
        <section className="relative overflow-hidden rounded-card bg-ink p-5 text-white">
          <div className="pointer-events-none absolute -right-12 -top-12 h-40 w-40 rounded-full bg-crimson/40 blur-3xl" />
          <p className="eyebrow flex items-center gap-1.5 !text-white/55"><Flame className="h-3 w-3" /> Racha de uso</p>
          <p className="mt-2 text-5xl font-semibold tracking-tighter">{streak.days}<span className="ml-2 text-base font-medium tracking-normal text-white/60">{streak.days === 1 ? "día" : "días"}</span></p>
          <p className="mt-2 text-sm text-white/65">{streak.activeToday ? "Hoy ya sumaste actividad." : streak.days > 0 ? "Sumá actividad hoy para no cortarla." : "Generá un outfit o cargá una prenda para empezar."}</p>
        </section>
        <section className="card p-5">
          <p className="eyebrow flex items-center gap-1.5"><Target className="h-3 w-3" /> Desafío de la semana</p>
          <div className="mt-2 flex items-start justify-between gap-3">
            <div>
              <p className="text-lg font-semibold">{challenge.title}</p>
              <p className="text-sm text-graphite">{challenge.description}</p>
            </div>
            <span className="text-lg font-semibold">{challenge.progress}/{challenge.goal}</span>
          </div>
          <div className="mt-4"><ProgressBar value={challenge.progress} max={challenge.goal} /></div>
          <p className="mt-2 text-xs text-graphite">{challenge.done ? "¡Cumplido! El lunes llega uno nuevo." : `Quedan ${challenge.daysLeft} ${challenge.daysLeft === 1 ? "día" : "días"} · se renueva cada lunes`}</p>
        </section>
      </div>

      <section>
        <SectionTitle title="Uso del guardarropa" />
        <div className="card p-5">
          <dl className="grid grid-cols-3 gap-3 text-center">
            {[["Prendas", stats.total], ["Outfits creados", stats.outfitsCreated], ["Usos registrados", stats.outfitsWorn]].map(([label, value]) => (
              <div key={label} className="rounded-xl bg-mist px-2 py-3">
                <dd className="text-2xl font-semibold">{value}</dd>
                <dt className="text-[11px] text-graphite">{label}</dt>
              </div>
            ))}
          </dl>
          <div className="mt-5">
            <div className="mb-2 flex items-baseline justify-between">
              <p className="text-sm font-medium">Prendas usadas en los últimos 30 días</p>
              <p className="text-sm font-semibold">{stats.usedLast30} de {stats.total} · {Math.round(stats.usageRate * 100)}%</p>
            </div>
            <ProgressBar value={stats.usedLast30} max={stats.total} tone="ink" />
            <p className="mt-2 text-xs text-graphite">El objetivo es reutilizar más: registrá "Lo uso hoy" en cada outfit para que este número refleje tu día a día.</p>
          </div>
          <div className="mt-6 space-y-2.5">
            <p className="text-sm font-medium">Por categoría</p>
            {stats.byCategory.map((c) => (
              <div key={c.category} className="flex items-center gap-3 text-xs">
                <span className="w-28 shrink-0 text-graphite">{c.label}</span>
                <span className="h-2 flex-1 overflow-hidden rounded-full bg-mist"><span className="block h-full rounded-full bg-ink transition-[width] duration-500" style={{ width: `${(c.count / maxCategory) * 100}%` }} /></span>
                <span className="w-6 text-right font-semibold">{c.count}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section>
        <SectionTitle title="Análisis por prenda" action={!advanced && <span className="flex items-center gap-1 rounded-full bg-crimson-soft px-2.5 py-1 text-[11px] font-semibold text-crimson"><Crown className="h-3 w-3" /> Premium</span>} />
        {advanced ? (
          <div className="card space-y-6 p-5">
            <GarmentRow title="Tus más usadas" empty="Todavía no registraste usos." items={stats.mostWorn} caption={(g) => `${g.wear_count} ${g.wear_count === 1 ? "uso" : "usos"}`} />
            <GarmentRow title="Olvidadas (más de 60 días sin uso)" empty="No tenés prendas olvidadas. ¡Bien ahí!" items={stats.forgotten} caption={() => "Reactivar"} />
            <GarmentRow title="Sin estrenar" empty="Ya usaste todas tus prendas." items={stats.neverWorn} caption={() => "Estrenar"} />
          </div>
        ) : (
          <Link to="/premium" className="card flex items-center gap-4 p-5 transition-shadow hover:shadow-lift">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-mist"><Lock className="h-5 w-5" /></span>
            <span className="text-sm leading-relaxed">
              <span className="font-semibold">Descubrí qué prendas rinden más y cuáles quedaron olvidadas.</span>{" "}
              <span className="text-graphite">El ranking de más usadas, las olvidadas y las que faltan estrenar están en Premium. Tenés {stats.neverWorn.length} sin estrenar.</span>
            </span>
          </Link>
        )}
      </section>

      <section>
        <SectionTitle title="Logros" action={<span className="text-[13px] font-medium text-graphite">{unlocked} de {badges.length}</span>} />
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {badges.map((b) => (
            <li key={b.id} className={cx("flex items-start gap-3 rounded-card border p-4 transition-colors", b.unlocked ? "border-ink bg-paper" : "border-black/[0.07]")}>
              <span className={cx("flex h-10 w-10 shrink-0 items-center justify-center rounded-full", b.unlocked ? "bg-crimson text-white" : "bg-mist text-graphite/60")}>
                {b.unlocked ? <Check className="h-5 w-5" /> : <Award className="h-5 w-5" />}
              </span>
              <div className="min-w-0 flex-1">
                <p className={cx("text-sm font-semibold", !b.unlocked && "text-graphite")}>{b.title}</p>
                <p className="text-xs leading-relaxed text-graphite">{b.description}</p>
                {!b.unlocked && <div className="mt-2 flex items-center gap-2"><ProgressBar value={b.progress} max={b.goal} tone="ink" /><span className="shrink-0 text-[11px] font-medium text-graphite">{b.progress}/{b.goal}</span></div>}
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
