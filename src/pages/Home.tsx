import { useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, BarChart3, Check, Compass, Crown, Flame, History, Plus, Sparkles, Target } from "lucide-react";
import { OCCASIONS } from "@shared/taxonomy.ts";
import { GarmentThumb } from "@/components/Garment";
import { OutfitStrip } from "@/components/OutfitGrid";
import { Button, cx, ProgressBar, SectionTitle, Skeleton } from "@/components/ui";
import { RainSelector, WeatherCard } from "@/components/Weather";
import { useEntitlements, useGarments, useInspirations, useOutfits, useProfile } from "@/hooks/data";
import { useWeather } from "@/hooks/weather";
import { capitalize, currentSeason, dayKey, greeting, longDate, lowerFirst } from "@/lib/format";
import { computeStreak, wardrobeStats, weeklyChallenge } from "@/lib/gamification";
import { EMPTY_INTENT, generateOutfits, missingForOutfit } from "@/styling/engine";

/** Generador pseudoaleatorio con semilla: la "idea del día" no cambia en cada render. */
function seededRng(seed: string) {
  let s = [...seed].reduce((acc, ch) => (acc * 31 + ch.charCodeAt(0)) >>> 0, 7);
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

function MoreLink({ to, children }: { to: string; children: string }) {
  return <Link to={to} className="flex items-center gap-1 text-[13px] font-medium text-graphite transition-colors hover:text-ink">{children} <ArrowRight className="h-3.5 w-3.5" /></Link>;
}

export function HomePage() {
  const navigate = useNavigate();
  const { data: profile } = useProfile();
  const { data: garments, isLoading } = useGarments();
  const { data: outfits } = useOutfits();
  const { data: inspirations = [] } = useInspirations();
  const { data: entitlements } = useEntitlements();
  const { styling } = useWeather();

  const list = garments ?? [];
  const history = outfits ?? [];
  const season = currentSeason(profile?.location_lat);
  const missing = missingForOutfit(list);
  const stats = useMemo(() => wardrobeStats(list, history), [list, history]);
  const streak = useMemo(() => computeStreak(list, history), [list, history]);
  const challenge = useMemo(() => weeklyChallenge(list, history), [list, history]);

  // Idea del día: la mejor combinación que el motor encuentra para el clima de hoy.
  const idea = useMemo(() => {
    if (!profile || missing) return null;
    return generateOutfits({
      garments: list, profile, weather: styling, season, intent: EMPTY_INTENT,
      history: history.map((o) => ({ ids: o.outfit_items.map((i) => i.garment_id), rating: o.rating })),
      rng: seededRng(dayKey()),
    }, 1)[0] ?? null;
  }, [list, history, profile, styling, season, missing]);
  const ideaAnchor = idea?.items.find((g) => g.category === "top" || g.category === "dress");

  const quickOccasions = (profile?.occasions.length ? OCCASIONS.filter((o) => profile.occasions.includes(o.id)) : OCCASIONS).slice(0, 3);
  const forgotten = stats.forgotten[0];
  const lacks = list.length >= 3 ? (["outerwear", "shoes"] as const).find((c) => !list.some((g) => g.category === c)) : undefined;
  const firstSteps = [
    { done: list.length >= 5, label: `Cargá 5 prendas (${Math.min(list.length, 5)} de 5)`, to: "/guardarropa?nueva=1" },
    { done: history.length > 0, label: "Generá tu primer outfit", to: "/outfit" },
    { done: inspirations.length > 0, label: "Sumá una referencia de inspiración", to: "/inspiracion" },
  ];
  const onboardingDone = firstSteps.every((s) => s.done);

  return (
    <div className="space-y-8">
      <header>
        <p className="eyebrow">{capitalize(longDate())}</p>
        <h1 className="mt-1.5 text-[32px] font-semibold leading-[1.1] sm:text-[44px]">
          {greeting()}{profile?.display_name ? <>, <span className="text-crimson">{profile.display_name.split(" ")[0]}</span></> : ""}
        </h1>
      </header>

      <div className="grid gap-4 lg:grid-cols-2">
        <WeatherCard />

        {/* Outfit Exprés: acceso principal */}
        <section className="relative flex flex-col overflow-hidden rounded-card bg-ink p-5 text-white sm:p-6" aria-label="Outfit Exprés">
          <div className="pointer-events-none absolute -right-20 -top-20 h-60 w-60 rounded-full bg-crimson/40 blur-3xl" />
          <p className="eyebrow !text-white/55">Outfit Exprés</p>
          <h2 className="mt-2 text-2xl font-semibold leading-tight sm:text-[28px]">Tu look de hoy,<br />en segundos.</h2>
          <p className="mt-2 max-w-xs text-sm leading-relaxed text-white/65">
            {missing ? "Cargá tus prendas y tu estilista arma la combinación ideal para el clima y la ocasión." : "Combinamos tus prendas según el clima, la ocasión y tu estilo."}
          </p>
          <div className="relative mt-5"><RainSelector tone="dark" /></div>
          <div className="relative mt-4 flex flex-wrap items-center gap-2">
            {missing ? (
              <Button size="lg" onClick={() => navigate("/guardarropa?nueva=1")} icon={<Plus className="h-4 w-4" />}>Cargar prendas</Button>
            ) : (
              <Button size="lg" onClick={() => navigate("/outfit?auto=1")} icon={<Sparkles className="h-4 w-4" />}>Generar outfit</Button>
            )}
          </div>
          {!missing && (
            <div className="relative mt-4 flex flex-wrap gap-2">
              {quickOccasions.map((o) => (
                <button key={o.id} type="button" onClick={() => navigate(`/outfit?auto=1&ocasion=${o.id}`)}
                  className="rounded-full border border-white/20 px-3.5 py-1.5 text-xs font-medium text-white/85 transition-colors hover:border-white hover:text-white active:scale-95">
                  Para {o.label.toLowerCase()}
                </button>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* Accesos rápidos */}
      <nav className="grid grid-cols-4 gap-2 sm:gap-3" aria-label="Accesos rápidos">
        {[
          { to: "/guardarropa?nueva=1", label: "Agregar prenda", icon: Plus },
          { to: "/outfits", label: "Mis outfits", icon: History },
          { to: "/inspiracion", label: "Inspiración", icon: Compass },
          { to: "/progreso", label: "Mi progreso", icon: BarChart3 },
        ].map(({ to, label, icon: Icon }) => (
          <Link key={to} to={to} className="group flex flex-col items-center gap-2 rounded-card border border-black/[0.07] px-2 py-4 text-center transition-all duration-150 hover:border-ink hover:shadow-card active:scale-95">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-mist transition-colors group-hover:bg-ink group-hover:text-white"><Icon className="h-[18px] w-[18px]" strokeWidth={1.8} /></span>
            <span className="text-[11px] font-medium leading-tight sm:text-[13px]">{label}</span>
          </Link>
        ))}
      </nav>

      {isLoading && <Skeleton className="h-40" />}

      {/* Primeros pasos */}
      {!isLoading && !onboardingDone && (
        <section className="card p-5">
          <SectionTitle title="Primeros pasos" />
          <ul className="space-y-1">
            {firstSteps.map((step) => (
              <li key={step.label}>
                <Link to={step.to} className="flex items-center gap-3 rounded-xl px-2 py-2.5 text-sm transition-colors hover:bg-mist">
                  <span className={cx("flex h-6 w-6 shrink-0 items-center justify-center rounded-full border", step.done ? "border-crimson bg-crimson text-white" : "border-black/20")}>
                    {step.done && <Check className="h-3.5 w-3.5" />}
                  </span>
                  <span className={cx("flex-1", step.done && "text-graphite line-through")}>{step.label}</span>
                  {!step.done && <ArrowRight className="h-4 w-4 text-graphite" />}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Racha y desafío semanal */}
      {!isLoading && list.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Link to="/progreso" className="card flex items-center gap-4 p-5 transition-shadow hover:shadow-lift">
            <span className={cx("flex h-14 w-14 shrink-0 items-center justify-center rounded-full", streak.days > 0 ? "bg-crimson text-white" : "bg-mist text-graphite")}><Flame className="h-6 w-6" /></span>
            <div>
              <p className="eyebrow">Racha</p>
              <p className="text-xl font-semibold">{streak.days} {streak.days === 1 ? "día" : "días"}{streak.days > 1 ? " seguidos" : ""}</p>
              <p className="text-xs text-graphite">{streak.activeToday ? "Hoy ya sumaste. ¡Seguí así!" : streak.days > 0 ? "Generá o registrá un outfit hoy para mantenerla." : "Usá VESTIA hoy y empezá tu racha."}</p>
            </div>
          </Link>
          <Link to="/progreso" className="card p-5 transition-shadow hover:shadow-lift">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="eyebrow flex items-center gap-1.5"><Target className="h-3 w-3" /> Desafío semanal</p>
                <p className="mt-1 font-semibold">{challenge.title}</p>
                <p className="text-xs text-graphite">{challenge.description}</p>
              </div>
              <span className="shrink-0 text-sm font-semibold">{challenge.done ? <Check className="h-5 w-5 text-crimson" /> : `${challenge.progress}/${challenge.goal}`}</span>
            </div>
            <div className="mt-3"><ProgressBar value={challenge.progress} max={challenge.goal} /></div>
            <p className="mt-2 text-[11px] text-graphite">{challenge.done ? "¡Desafío cumplido!" : `Quedan ${challenge.daysLeft} ${challenge.daysLeft === 1 ? "día" : "días"}`}</p>
          </Link>
        </div>
      )}

      {/* Recomendaciones personalizadas */}
      {idea && ideaAnchor && (
        <section>
          <SectionTitle title="Idea del día" />
          <div className="card flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
            <OutfitStrip items={idea.items} />
            <div className="min-w-0 flex-1">
              <p className="text-sm leading-relaxed">
                Probá {idea.items.filter((g) => g.category !== "accessory").map((g) => lowerFirst(g.name)).join(" + ")}
                {styling ? `: va bien con los ${Math.round(styling.feelsLikeC)}° de sensación térmica${styling.rain ? " y la lluvia" : ""}.` : "."}
              </p>
              <Button size="sm" variant="dark" className="mt-3" onClick={() => navigate(`/outfit?auto=1&prenda=${ideaAnchor.id}`)} icon={<Sparkles className="h-4 w-4" />}>
                Armar look con {lowerFirst(ideaAnchor.name)}
              </Button>
            </div>
          </div>
        </section>
      )}

      {stats.neverWorn.length > 0 && !missing && (
        <section>
          <SectionTitle title="Todavía sin estrenar" action={<MoreLink to="/progreso">Ver estadísticas</MoreLink>} />
          <p className="-mt-2 mb-3 text-sm text-graphite">Tocá una prenda y armamos un look alrededor de ella.</p>
          <div className="no-scrollbar -mx-4 flex gap-3 overflow-x-auto px-4 sm:mx-0 sm:px-0">
            {stats.neverWorn.slice(0, 10).map((g) => (
              <button key={g.id} type="button" onClick={() => navigate(`/outfit?auto=1&prenda=${g.id}`)} className="w-28 shrink-0 text-left transition-transform active:scale-95 sm:w-32">
                <GarmentThumb garment={g} />
                <p className="mt-1.5 truncate text-xs font-medium">{g.name}</p>
              </button>
            ))}
          </div>
        </section>
      )}

      {(forgotten || lacks || stats.total >= 5) && (
        <section>
          <SectionTitle title="Para aprovechar tu guardarropa" />
          <div className="grid gap-3 sm:grid-cols-2">
            {forgotten && (
              <Link to={`/outfit?auto=1&prenda=${forgotten.id}`} className="flex items-center gap-4 rounded-card border border-black/[0.07] p-4 transition-all hover:border-ink">
                <GarmentThumb garment={forgotten} className="w-14 shrink-0 !rounded-lg" />
                <p className="text-sm leading-relaxed">Hace más de dos meses que no usás <span className="font-semibold">{lowerFirst(forgotten.name)}</span>. ¿Le damos una nueva oportunidad?</p>
              </Link>
            )}
            {lacks && (
              <Link to="/guardarropa?nueva=1" className="flex items-center gap-4 rounded-card border border-black/[0.07] p-4 transition-all hover:border-ink">
                <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-mist"><Plus className="h-5 w-5" /></span>
                <p className="text-sm leading-relaxed">Todavía no cargaste <span className="font-semibold">{lacks === "outerwear" ? "abrigos" : "calzado"}</span>. Sumá al menos uno para que tus outfits queden completos.</p>
              </Link>
            )}
            {stats.total >= 5 && (
              <Link to="/progreso" className="flex items-center gap-4 rounded-card border border-black/[0.07] p-4 transition-all hover:border-ink">
                <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-mist text-lg font-semibold">{Math.round(stats.usageRate * 100)}%</span>
                <p className="text-sm leading-relaxed">Usaste <span className="font-semibold">{stats.usedLast30} de tus {stats.total} prendas</span> en los últimos 30 días. Registrá tus looks para verlo crecer.</p>
              </Link>
            )}
          </div>
        </section>
      )}

      {/* Mi inspiración */}
      <section>
        <SectionTitle title="Mi inspiración" action={<MoreLink to="/inspiracion">{inspirations.length ? "Ver todo" : "Probar"}</MoreLink>} />
        {inspirations.length > 0 ? (
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
            {inspirations.slice(0, 4).map((item, i) => (
              <Link key={item.id} to="/inspiracion" className={cx("group block", i === 3 && "hidden sm:block")}>
                <div className="aspect-[4/5] overflow-hidden rounded-card bg-mist transition-shadow group-hover:shadow-md">
                  {item.imageUrl && <img src={item.imageUrl} alt={item.title || "Referencia de inspiración"} className="h-full w-full object-cover" loading="lazy" />}
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <Link to="/inspiracion" className="flex items-center gap-4 rounded-card border border-black/[0.07] p-4 transition-all hover:border-ink">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-mist"><Compass className="h-5 w-5" /></span>
            <p className="text-sm leading-relaxed">Subí una foto de un look que te guste y armamos una versión parecida con tu ropa.</p>
          </Link>
        )}
      </section>

      {entitlements?.plan.id === "free" && (
        <Link to="/premium" className="flex items-center gap-4 rounded-card bg-mist p-5 transition-colors hover:bg-black/[0.08]">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-paper text-crimson"><Crown className="h-5 w-5" /></span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold">VESTIA Premium</span>
            <span className="block text-xs leading-relaxed text-graphite">Más prendas, más outfits por día y estadísticas avanzadas. Probalo 7 días gratis.</span>
          </span>
          <ArrowRight className="h-4 w-4 shrink-0" />
        </Link>
      )}

    </div>
  );
}
