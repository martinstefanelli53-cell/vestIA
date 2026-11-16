// Componentes de clima: tarjeta, selector de lluvia y configuración de ubicación.
import { useEffect, useState } from "react";
import { Cloud, CloudFog, CloudLightning, CloudRain, LocateFixed, MapPin, Moon, RefreshCw, Search, Settings2, Snowflake, Sun, Umbrella } from "lucide-react";
import type { PlaceResult, WeatherKind } from "@shared/taxonomy.ts";
import { api } from "@/lib/api";
import { timeAgo, weekdayShort } from "@/lib/format";
import { friendlyError, useBackendStatus, useProfile } from "@/hooks/data";
import { isRaining, useWeather } from "@/hooks/weather";
import { useToast } from "./Toast";
import { Button, cx, IconButton, Segmented, Sheet, Skeleton, Spinner } from "./ui";

export function WeatherIcon({ kind, isDay = true, className }: { kind: WeatherKind; isDay?: boolean; className?: string }) {
  const Icon = kind === "clear" ? (isDay ? Sun : Moon) : kind === "cloudy" ? Cloud : kind === "fog" ? CloudFog : kind === "storm" ? CloudLightning : kind === "snow" ? Snowflake : CloudRain;
  return <Icon className={className} strokeWidth={1.5} aria-hidden />;
}

/** Selector Con lluvia / Sin lluvia. Por defecto refleja el clima real. */
export function RainSelector({ tone = "light" }: { tone?: "light" | "dark" }) {
  const { snapshot, rainMode, setRainMode } = useWeather();
  const real = snapshot ? isRaining(snapshot) : null;
  const effective = rainMode === "real" ? real ?? false : rainMode === "rain";
  const simulated = rainMode !== "real";

  const choose = (rain: boolean) => setRainMode(real !== null && rain === real ? "real" : rain ? "rain" : "dry");

  return (
    <div>
      <Segmented
        ariaLabel="Escenario de lluvia"
        tone={tone}
        value={effective ? "rain" : "dry"}
        onChange={(v) => choose(v === "rain")}
        options={[
          { value: "dry", label: <><Sun className="h-4 w-4" /> Sin lluvia</> },
          { value: "rain", label: <><Umbrella className="h-4 w-4" /> Con lluvia</> },
        ]}
      />
      <p className={cx("mt-2 flex min-h-5 items-center justify-between gap-2 text-xs", tone === "dark" ? "text-white/60" : "text-graphite")}>
        <span>{simulated ? "Simulando un escenario distinto al clima actual." : real === null ? "Sin datos de clima: elegí el escenario." : "Usando el clima real de hoy."}</span>
        {simulated && real !== null && (
          <button type="button" onClick={() => setRainMode("real")} className={cx("shrink-0 font-semibold underline underline-offset-2", tone === "dark" ? "text-white" : "text-crimson")}>
            Volver al clima real
          </button>
        )}
      </p>
    </div>
  );
}

export function WeatherCard() {
  const { status, snapshot, error, isFetching, refresh, locate } = useWeather();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [locating, setLocating] = useState(false);
  const toast = useToast();
  const [, tick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 60_000); // refresca "actualizado hace…"
    return () => clearInterval(id);
  }, []);

  const useMyLocation = async () => {
    setLocating(true);
    try { await locate(); } catch (e) { toast(friendlyError(e), "error"); setSettingsOpen(true); } finally { setLocating(false); }
  };

  return (
    <section className="card p-5" aria-label="Clima">
      {status === "loading" && <div className="space-y-3"><Skeleton className="h-12 w-32" /><Skeleton className="h-4 w-48" /><Skeleton className="h-10 w-full" /></div>}

      {status === "needs-location" && (
        <div>
          <p className="eyebrow mb-2">Clima</p>
          <h2 className="text-lg font-semibold">Activá tu ubicación</h2>
          <p className="mt-1 text-sm leading-relaxed text-graphite">Con el clima de tu zona, tus outfits se adaptan a la temperatura y a la lluvia.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button size="sm" variant="dark" loading={locating} onClick={useMyLocation} icon={<LocateFixed className="h-4 w-4" />}>Usar mi ubicación</Button>
            <Button size="sm" variant="outline" onClick={() => setSettingsOpen(true)} icon={<Search className="h-4 w-4" />}>Elegir ciudad</Button>
          </div>
        </div>
      )}

      {status === "error" && (
        <div>
          <p className="eyebrow mb-2">Clima</p>
          <h2 className="text-lg font-semibold">No pudimos cargar el clima</h2>
          <p className="mt-1 text-sm text-graphite">{error ?? "Revisá tu conexión e intentá de nuevo."} Mientras tanto, podés generar outfits igual.</p>
          <div className="mt-4 flex gap-2">
            <Button size="sm" variant="dark" loading={isFetching} onClick={refresh}>Reintentar</Button>
            <Button size="sm" variant="outline" onClick={() => setSettingsOpen(true)}>Cambiar ubicación</Button>
          </div>
        </div>
      )}

      {status === "ready" && snapshot && (
        <div>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="eyebrow flex items-center gap-1"><MapPin className="h-3 w-3" /><span className="truncate">{snapshot.location.name}</span></p>
              <div className="mt-1.5 flex items-end gap-3">
                <span className="text-6xl font-semibold leading-none tracking-tighter">{Math.round(snapshot.current.tempC)}°</span>
                <div className="pb-1">
                  <p className="text-sm font-medium">{snapshot.current.condition}</p>
                  <p className="text-xs text-graphite">Sensación {Math.round(snapshot.current.feelsLikeC)}°</p>
                </div>
              </div>
            </div>
            <WeatherIcon kind={snapshot.current.kind} isDay={snapshot.current.isDay} className="h-12 w-12 shrink-0 text-ink" />
          </div>

          <dl className="mt-5 grid grid-cols-3 gap-2 text-center">
            {[
              ["Lluvia", `${Math.round(snapshot.today.chanceOfRain)}%`],
              ["Mínima", `${Math.round(snapshot.today.minC)}°`],
              ["Máxima", `${Math.round(snapshot.today.maxC)}°`],
            ].map(([label, value]) => (
              <div key={label} className="rounded-xl bg-mist px-2 py-2.5">
                <dt className="text-[11px] text-graphite">{label}</dt>
                <dd className="text-base font-semibold">{value}</dd>
              </div>
            ))}
          </dl>

          {snapshot.forecast.length > 1 && (
            <ul className="mt-3 flex gap-2" aria-label="Pronóstico">
              {snapshot.forecast.slice(1).map((day) => (
                <li key={day.date} className="flex flex-1 items-center justify-between gap-2 rounded-xl border border-black/[0.07] px-3 py-2 text-xs">
                  <span className="font-medium capitalize">{weekdayShort(day.date)}</span>
                  <WeatherIcon kind={day.kind} className="h-4 w-4 text-graphite" />
                  <span className="text-graphite">{Math.round(day.minC)}° / {Math.round(day.maxC)}°</span>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-3 flex items-center justify-between gap-2 text-xs text-graphite">
            <span>{snapshot.stale ? "Sin conexión con el servicio · datos de " : "Actualizado "}{timeAgo(snapshot.fetchedAt)}</span>
            <span className="flex items-center">
              <IconButton label="Actualizar clima" onClick={refresh} disabled={isFetching} className="h-8 w-8"><RefreshCw className={cx("h-4 w-4", isFetching && "animate-spin")} /></IconButton>
              <IconButton label="Configurar clima y ubicación" onClick={() => setSettingsOpen(true)} className="h-8 w-8"><Settings2 className="h-4 w-4" /></IconButton>
            </span>
          </div>
        </div>
      )}

      <LocationSheet open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </section>
  );
}

/** Configuración de ubicación: detección automática o búsqueda manual de ciudad. */
export function LocationSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data: profile } = useProfile();
  const { data: status } = useBackendStatus();
  const { locate, setManualLocation, snapshot } = useWeather();
  const toast = useToast();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PlaceResult[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const term = query.trim();
    if (term.length < 2) { setResults(null); return; }
    setSearching(true);
    const id = setTimeout(() => {
      api<PlaceResult[]>(`/weather/search?q=${encodeURIComponent(term)}`)
        .then(setResults)
        .catch(() => setResults([]))
        .finally(() => setSearching(false));
    }, 350);
    return () => clearTimeout(id);
  }, [query]);

  const run = async (action: () => Promise<void>, message: string) => {
    setBusy(true);
    try {
      await action();
      toast(message);
      setQuery("");
      onClose();
    } catch (e) {
      toast(friendlyError(e), "error");
    } finally {
      setBusy(false);
    }
  };

  const currentName = profile?.location_name ?? (profile?.location_lat !== null && profile?.location_lat !== undefined ? snapshot?.location.name ?? "Ubicación detectada" : "Sin definir");

  return (
    <Sheet open={open} onClose={onClose} title="Clima y ubicación">
      <div className="space-y-5">
        <div className="rounded-xl bg-mist p-4">
          <p className="eyebrow">Ubicación actual</p>
          <p className="mt-1 font-semibold">{currentName}</p>
          <p className="text-xs text-graphite">
            {profile?.location_mode === "manual" ? "Elegida manualmente" : "Detección automática"}
            {profile?.location_region ? ` · ${profile.location_region}` : ""}
          </p>
        </div>

        <Button variant="dark" full loading={busy} onClick={() => run(locate, "Ubicación actualizada")} icon={<LocateFixed className="h-4 w-4" />}>
          Usar mi ubicación actual
        </Button>

        <div>
          <label htmlFor="city-search" className="mb-1.5 block text-[13px] font-medium">O elegí una ciudad</label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-graphite" />
            <input id="city-search" className="field pl-10" placeholder="Buscar ciudad…" value={query} onChange={(e) => setQuery(e.target.value)} autoComplete="off" />
            {searching && <Spinner className="absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2" />}
          </div>
          {results && (
            <ul className="mt-2 divide-y divide-black/[0.06] overflow-hidden rounded-xl border border-black/10">
              {results.length === 0 && <li className="px-4 py-3 text-sm text-graphite">No encontramos esa ciudad.</li>}
              {results.map((place) => (
                <li key={`${place.lat},${place.lon}`}>
                  <button type="button" disabled={busy} onClick={() => run(() => setManualLocation(place), `Clima de ${place.name}`)} className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-mist">
                    <MapPin className="h-4 w-4 shrink-0 text-graphite" />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">{place.name}</span>
                      <span className="block truncate text-xs text-graphite">{[place.region, place.country].filter(Boolean).join(", ")}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <p className="text-xs leading-relaxed text-graphite">
          El clima se actualiza automáticamente cada 20 minutos.
          {status && ` Fuente de datos: ${status.weatherProvider === "weatherapi" ? "WeatherAPI.com" : "Open-Meteo (proveedor de respaldo)"}.`}
        </p>
      </div>
    </Sheet>
  );
}
