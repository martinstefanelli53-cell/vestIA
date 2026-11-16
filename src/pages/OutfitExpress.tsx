// Outfit Exprés: asistente de estilismo. Genera combinaciones con las prendas
// reales del guardarropa según clima, ocasión, perfil e historial, y permite
// conversar, pedir otra opción, reemplazar una prenda y valorar el resultado.
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Bookmark, Check, Lock, RefreshCw, Send, Shirt, Sparkles, ThumbsDown, ThumbsUp, X } from "lucide-react";
import { OCCASIONS } from "@shared/taxonomy.ts";
import { OutfitGrid } from "@/components/OutfitGrid";
import { LimitSheet } from "@/components/Plan";
import { useToast } from "@/components/Toast";
import { Button, Chip, cx, EmptyState, PageHeader, Skeleton } from "@/components/ui";
import { RainSelector, WeatherIcon } from "@/components/Weather";
import { friendlyError, isLimitError, useBackendStatus, useEntitlements, useGarments, useOutfitActions, useOutfits, useProfile } from "@/hooks/data";
import { useWeather } from "@/hooks/weather";
import { currentSeason, dayKey } from "@/lib/format";
import type { Garment } from "@/lib/types";
import { missingForOutfit } from "@/styling/engine";
import { styleOutfit, StylingError, swapGarment, type StyledOutfit, type StyleRequest } from "@/styling/stylist";

interface Current extends StyledOutfit {
  outfitId: string;
}
type Turn = { role: "user" | "assistant"; text: string };

const SUGGESTIONS = [
  "Algo cómodo para ir a trabajar",
  "Un look para salir a cenar",
  "Más elegante",
  "Hace frío, algo abrigado",
];

export function OutfitExpressPage() {
  const { data: garments, isLoading: loadingGarments } = useGarments();
  const { data: profile } = useProfile();
  const { data: outfits } = useOutfits();
  const { data: entitlements } = useEntitlements();
  const { data: backend } = useBackendStatus();
  const { snapshot, styling, rainMode } = useWeather();
  const actions = useOutfitActions();
  const toast = useToast();
  const [params, setParams] = useSearchParams();

  const [occasion, setOccasion] = useState<string | null>(() => params.get("ocasion"));
  const [lockedId, setLockedId] = useState<string | null>(() => params.get("prenda"));
  const [current, setCurrent] = useState<Current | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [lastRequest, setLastRequest] = useState<string | undefined>(undefined);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState<"generate" | "swap" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [limitOpen, setLimitOpen] = useState(false);
  const [aiOff, setAiOff] = useState(false);
  const [tried, setTried] = useState<string[]>([]);

  const ready = Boolean(garments && profile && outfits);
  const missing = garments ? missingForOutfit(garments) : null;
  const locked = garments?.find((g) => g.id === lockedId) ?? null;
  const live = outfits?.find((o) => o.id === current?.outfitId);
  const wornToday = live?.outfit_wears.find((w) => w.worn_on === dayKey());
  const used = entitlements?.outfits_last_24h ?? 0;
  const limit = entitlements?.plan.daily_outfit_limit;

  const request = (over: Partial<StyleRequest> = {}): StyleRequest => ({
    garments: garments!,
    profile: profile!,
    weather: styling,
    season: currentSeason(profile!.location_lat),
    occasion,
    history: outfits ?? [],
    lockedIds: lockedId ? [lockedId] : [],
    currentItems: current?.items,
    conversation: turns,
    useAi: Boolean(backend?.ai) && !aiOff,
    ...over,
  });

  const generate = async (over: { message?: string; occasion?: string | null } = {}) => {
    if (!ready || busy) return;
    if (limit !== undefined && used >= limit) { setLimitOpen(true); return; }
    const message = over.message?.trim() || undefined;
    setBusy("generate");
    setError(null);
    try {
      const req = request({ message, ...(over.occasion !== undefined ? { occasion: over.occasion } : {}) });
      // Sin datos de clima, el selector de lluvia igual condiciona el pedido.
      const styled = await styleOutfit(!styling && rainMode !== "real" ? { ...req, message: `${message ?? ""} ${rainMode === "rain" ? "con lluvia" : "sin lluvia"}`.trim() } : req);
      if (styled.aiUnavailable) setAiOff(true);
      const outfit = await actions.create({
        items: styled.items,
        occasion: styled.occasion,
        request_text: message ?? null,
        explanation: styled.explanation,
        source: styled.source,
        weather: styling,
        rain_mode: rainMode,
      });
      setCurrent({ ...styled, outfitId: outfit.id });
      setTried([]);
      setTurns((list) => [...list, ...(message ? [{ role: "user" as const, text: message }] : []), { role: "assistant" as const, text: styled.explanation }].slice(-8));
      if (message) setLastRequest(message);
      if (styled.occasion && OCCASIONS.some((o) => o.id === styled.occasion)) setOccasion(styled.occasion);
    } catch (e) {
      if (e instanceof StylingError) setError(e.message);
      else if (isLimitError(e)) setLimitOpen(true);
      else toast(friendlyError(e), "error");
    } finally {
      setBusy(null);
    }
  };

  // Llegada desde otra pantalla: /outfit?auto=1[&prenda=…][&ocasion=…][&pedido=…]
  const autoRan = useRef(false);
  useEffect(() => {
    if (!ready || autoRan.current) return;
    autoRan.current = true;
    if (params.get("auto")) {
      const pedido = params.get("pedido") ?? undefined;
      setParams({}, { replace: true });
      void generate({ message: pedido });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  // Al cambiar el escenario de lluvia se recalcula el outfit en pantalla.
  const lastRain = useRef(rainMode);
  useEffect(() => {
    if (lastRain.current === rainMode) return;
    lastRain.current = rainMode;
    if (current) void generate({ message: lastRequest });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rainMode]);

  const chooseOccasion = (id: string) => {
    const next = occasion === id ? null : id;
    setOccasion(next);
    if (current) void generate({ occasion: next });
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!text.trim()) return;
    const message = text;
    setText("");
    void generate({ message });
  };

  const swap = async (garment: Garment) => {
    if (!current || busy) return;
    const attempt = (exclude: string[]) => swapGarment(request({ excludeIds: exclude }), garment.id);
    const result = attempt(tried) ?? (tried.length ? attempt([]) : null);
    if (!result) { toast("No tenés otra prenda de esa categoría para reemplazarla.", "error"); return; }
    setBusy("swap");
    try {
      await actions.replaceItems(current.outfitId, result.items, result.explanation);
      setCurrent({ ...current, ...result });
      setTried((list) => [...list, garment.id]);
      if (garment.id === lockedId) setLockedId(null);
    } catch (e) {
      toast(friendlyError(e), "error");
    } finally {
      setBusy(null);
    }
  };

  const act = async (action: () => Promise<void>, message?: string) => {
    try { await action(); if (message) toast(message); } catch (e) { toast(friendlyError(e), "error"); }
  };
  const rate = (value: 1 | -1) => current && act(
    () => actions.update(current.outfitId, { rating: live?.rating === value ? null : value }),
    live?.rating === value ? undefined : value === 1 ? "¡Genial! Lo tengo en cuenta." : "Anotado: voy a evitar combinaciones así.",
  );

  return (
    <>
      <PageHeader
        overline="Asistente de estilismo"
        title="Outfit Exprés"
        action={limit !== undefined && (
          <Link to="/premium" className={cx("shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-colors", used >= limit ? "bg-crimson text-white" : "bg-mist text-graphite hover:text-ink")} title="Generaciones en las últimas 24 horas">
            {used} de {limit} hoy
          </Link>
        )}
      />

      {/* Contexto: clima, lluvia y ocasión */}
      <section className="card mb-5 p-4 sm:p-5">
        <div className="grid gap-4 sm:grid-cols-2 sm:items-start">
          <div>
            <p className="eyebrow mb-2">Clima</p>
            {snapshot ? (
              <p className="flex items-center gap-2.5 text-sm">
                <WeatherIcon kind={snapshot.current.kind} isDay={snapshot.current.isDay} className="h-6 w-6" />
                <span><span className="font-semibold">{Math.round(snapshot.current.tempC)}°</span> · sensación {Math.round(snapshot.current.feelsLikeC)}° · {snapshot.current.condition}</span>
              </p>
            ) : (
              <p className="text-sm text-graphite">Sin datos de clima. <Link to="/perfil" className="font-medium text-ink underline underline-offset-2">Configurar ubicación</Link></p>
            )}
          </div>
          <RainSelector />
        </div>
        <div className="mt-4 border-t border-black/[0.06] pt-4">
          <p className="eyebrow mb-2.5">Ocasión</p>
          <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0">
            {OCCASIONS.map((o) => <Chip key={o.id} selected={occasion === o.id} disabled={busy !== null} onClick={() => chooseOccasion(o.id)}>{o.label}</Chip>)}
          </div>
        </div>
      </section>

      {locked && (
        <p className="mb-4 inline-flex items-center gap-2 rounded-full bg-ink py-1.5 pl-3.5 pr-1.5 text-[13px] font-medium text-white animate-fade-in">
          <Lock className="h-3.5 w-3.5" /> Con: {locked.name}
          <button type="button" aria-label="Dejar de fijar esta prenda" onClick={() => setLockedId(null)} className="flex h-6 w-6 items-center justify-center rounded-full hover:bg-white/20"><X className="h-3.5 w-3.5" /></button>
        </p>
      )}

      {/* Resultado */}
      {(loadingGarments || busy === "generate") && (
        <section className="card p-5" aria-busy="true">
          <p className="mb-4 flex items-center gap-2 text-sm font-medium"><Sparkles className="h-4 w-4 animate-pulse text-crimson" /> {busy ? "Armando tu outfit…" : "Cargando tu guardarropa…"}</p>
          <div className="grid grid-cols-3 gap-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="aspect-[4/5]" />)}</div>
          <Skeleton className="mt-4 h-4 w-3/4" /><Skeleton className="mt-2 h-4 w-1/2" />
        </section>
      )}

      {!loadingGarments && busy !== "generate" && missing && (
        <EmptyState
          icon={<Shirt className="h-5 w-5" />}
          title="Todavía no alcanza para un outfit"
          text={missing}
          action={<Link to="/guardarropa?nueva=1"><Button>Cargar prendas</Button></Link>}
        />
      )}

      {!loadingGarments && busy !== "generate" && !missing && !current && (
        <section className="relative overflow-hidden rounded-card bg-ink px-6 py-10 text-center text-white animate-fade-up">
          <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-crimson/35 blur-3xl" />
          <p className="eyebrow !text-white/50">Tu estilista personal</p>
          <h2 className="mx-auto mt-3 max-w-sm text-3xl font-semibold leading-tight">¿Qué te ponés hoy?</h2>
          <p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-white/65">
            Combino tus {garments?.length} prendas según el clima{occasion ? `, pensando en ${OCCASIONS.find((o) => o.id === occasion)?.label.toLowerCase()}` : ""} y tu estilo.
          </p>
          <Button size="lg" className="relative mt-7" disabled={!ready} onClick={() => generate()} icon={<Sparkles className="h-4 w-4" />}>Generar outfit</Button>
          {error && <p role="alert" className="relative mx-auto mt-5 max-w-sm rounded-xl bg-white/10 px-4 py-2.5 text-[13px]">{error}</p>}
        </section>
      )}

      {busy !== "generate" && current && (
        <section className="card p-4 sm:p-6 animate-fade-up" aria-label="Outfit generado">
          {lastRequest && live?.request_text && (
            <p className="mb-4 ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-md bg-mist px-4 py-2.5 text-sm">{live.request_text}</p>
          )}
          <OutfitGrid items={current.items} onReplace={swap} busy={busy !== null} />

          <div className="mt-5 flex items-start gap-3">
            <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-crimson text-white"><Sparkles className="h-4 w-4" /></span>
            <div className="min-w-0">
              <p className="text-[15px] leading-relaxed">{current.explanation}</p>
              {current.gap && <p className="mt-2 rounded-xl bg-mist px-3.5 py-2.5 text-[13px] leading-relaxed text-graphite">{current.gap}</p>}
              {error && <p role="alert" className="mt-2 rounded-xl bg-crimson-soft px-3.5 py-2.5 text-[13px] font-medium text-crimson">{error}</p>}
              <p className="mt-2 text-xs text-graphite">
                {current.source === "ai" ? "Elegido por tu estilista con IA" : "Elegido por el motor de estilo de VESTIA"}
                {live?.weather?.simulated ? " · escenario de lluvia simulado" : ""}
              </p>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-black/[0.06] pt-4">
            <Button variant="dark" size="sm" disabled={busy !== null} onClick={() => generate({ message: lastRequest })} icon={<RefreshCw className="h-4 w-4" />}>Otra combinación</Button>
            <Button variant={live?.is_saved ? "primary" : "outline"} size="sm" onClick={() => act(() => actions.update(current.outfitId, { is_saved: !live?.is_saved }), live?.is_saved ? "Quitado de guardados" : "Outfit guardado")}
              icon={<Bookmark className="h-4 w-4" fill={live?.is_saved ? "currentColor" : "none"} />}>{live?.is_saved ? "Guardado" : "Guardar"}</Button>
            <Button variant={wornToday ? "primary" : "outline"} size="sm"
              onClick={() => act(() => (wornToday ? actions.removeWear(wornToday.id) : actions.logWear(current.outfitId, dayKey())), wornToday ? "Uso quitado" : "Registrado como usado hoy")}
              icon={<Check className="h-4 w-4" />}>{wornToday ? "Usado hoy" : "Lo uso hoy"}</Button>
            <span className="ml-auto flex items-center gap-1">
              <span className="mr-1 hidden text-xs text-graphite sm:inline">¿Te gustó?</span>
              <button type="button" aria-label="Me gustó" aria-pressed={live?.rating === 1} onClick={() => rate(1)}
                className={cx("flex h-9 w-9 items-center justify-center rounded-full border transition-all duration-150 active:scale-90", live?.rating === 1 ? "border-ink bg-ink text-white" : "border-black/12 hover:border-ink")}>
                <ThumbsUp className="h-4 w-4" />
              </button>
              <button type="button" aria-label="No me gustó" aria-pressed={live?.rating === -1} onClick={() => rate(-1)}
                className={cx("flex h-9 w-9 items-center justify-center rounded-full border transition-all duration-150 active:scale-90", live?.rating === -1 ? "border-crimson bg-crimson text-white" : "border-black/12 hover:border-ink")}>
                <ThumbsDown className="h-4 w-4" />
              </button>
            </span>
          </div>
        </section>
      )}

      {/* Conversación */}
      {!missing && !loadingGarments && (
        <section className="mt-5">
          <form onSubmit={submit} className="flex items-center gap-2 rounded-full border border-black/12 bg-paper py-1.5 pl-5 pr-1.5 shadow-card transition-colors focus-within:border-ink">
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              maxLength={300}
              placeholder="Pedile algo a tu estilista…"
              aria-label="Pedido para tu estilista"
              className="h-10 min-w-0 flex-1 bg-transparent placeholder:text-graphite/60 focus:outline-none"
            />
            <button type="submit" aria-label="Enviar pedido" disabled={!text.trim() || busy !== null || !ready}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-crimson text-white transition-all duration-150 hover:bg-crimson-dark active:scale-90 disabled:cursor-not-allowed disabled:bg-mist disabled:text-graphite/50">
              <Send className="h-4 w-4" />
            </button>
          </form>
          <div className="no-scrollbar -mx-4 mt-3 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0">
            {SUGGESTIONS.map((s) => <Chip key={s} size="sm" disabled={busy !== null || !ready} onClick={() => generate({ message: s })}>{s}</Chip>)}
          </div>
        </section>
      )}

      <LimitSheet kind="outfits" open={limitOpen} onClose={() => setLimitOpen(false)} />
    </>
  );
}
