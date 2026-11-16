import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Bookmark, Check, Lock, Sparkles, ThumbsDown, ThumbsUp, Trash2 } from "lucide-react";
import { OCCASIONS } from "@shared/taxonomy.ts";
import { OutfitGrid, OutfitStrip } from "@/components/OutfitGrid";
import { useToast } from "@/components/Toast";
import { Button, Chip, ConfirmDialog, cx, EmptyState, IconButton, PageHeader, Sheet, Skeleton } from "@/components/ui";
import { friendlyError, useEntitlements, useGarments, useOutfitActions, useOutfits } from "@/hooks/data";
import { dayKey, shortDate } from "@/lib/format";
import type { Garment, Outfit } from "@/lib/types";
import { sortBySlot } from "@/styling/engine";

type Tab = "guardados" | "historial" | "usados";
type Resolved = Outfit & { items: Garment[] };

export function OutfitsPage() {
  const { data: outfits, isLoading } = useOutfits();
  const { data: garments } = useGarments();
  const { data: entitlements } = useEntitlements();
  const actions = useOutfitActions();
  const toast = useToast();
  const [tab, setTab] = useState<Tab>("historial");
  const [openId, setOpenId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Resolved | null>(null);
  const [busy, setBusy] = useState(false);

  // Se descartan outfits que quedaron incompletos porque se eliminaron prendas.
  const resolved = useMemo<Resolved[]>(() => {
    const byId = new Map((garments ?? []).map((g) => [g.id, g]));
    return (outfits ?? [])
      .map((o) => ({ ...o, items: sortBySlot(o.outfit_items.map((i) => byId.get(i.garment_id)).filter((g): g is Garment => Boolean(g))) }))
      .filter((o) => o.items.length >= 2 || o.items.some((g) => g.category === "dress"));
  }, [outfits, garments]);

  const historyDays = entitlements?.plan.history_days ?? null;
  const cutoff = historyDays ? Date.now() - historyDays * 86_400_000 : 0;
  const inWindow = (o: Outfit) => new Date(o.created_at).getTime() >= cutoff;
  const lists: Record<Tab, Resolved[]> = {
    guardados: resolved.filter((o) => o.is_saved),
    historial: resolved.filter(inWindow),
    usados: resolved.filter((o) => o.outfit_wears.length > 0),
  };
  const hiddenByPlan = resolved.length - resolved.filter(inWindow).length;
  const visible = lists[tab];
  const open = resolved.find((o) => o.id === openId) ?? null;
  const today = dayKey();

  const act = async (action: () => Promise<void>, message?: string) => {
    try { await action(); if (message) toast(message); } catch (e) { toast(friendlyError(e), "error"); }
  };
  const toggleWear = (o: Resolved) => {
    const worn = o.outfit_wears.find((w) => w.worn_on === today);
    return act(() => (worn ? actions.removeWear(worn.id) : actions.logWear(o.id, today)), worn ? "Uso quitado" : "Registrado como usado hoy");
  };
  const confirmDelete = async () => {
    if (!deleting) return;
    setBusy(true);
    await act(() => actions.remove(deleting.id), "Outfit eliminado");
    setBusy(false);
    setDeleting(null);
    setOpenId(null);
  };
  const meta = (o: Resolved) => [OCCASIONS.find((x) => x.id === o.occasion)?.label, shortDate(o.created_at), o.source === "ai" ? "Estilista IA" : null].filter(Boolean).join(" · ");

  return (
    <>
      <PageHeader overline={`${resolved.length} ${resolved.length === 1 ? "outfit" : "outfits"}`} title="Mis outfits"
        action={<Link to="/outfit"><Button icon={<Sparkles className="h-4 w-4" />}>Nuevo</Button></Link>} />

      <div className="mb-6 flex gap-2" role="tablist">
        {(["historial", "guardados", "usados"] as const).map((t) => (
          <Chip key={t} selected={tab === t} onClick={() => setTab(t)}>{t === "historial" ? "Historial" : t === "guardados" ? "Guardados" : "Usados"} <span className="opacity-60">{lists[t].length}</span></Chip>
        ))}
      </div>

      {isLoading && <div className="space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-28" />)}</div>}

      {!isLoading && visible.length === 0 && (
        <EmptyState
          icon={<Sparkles className="h-5 w-5" />}
          title={tab === "guardados" ? "Todavía no guardaste outfits" : tab === "usados" ? "Todavía no registraste usos" : "Tu historial está vacío"}
          text={tab === "guardados" ? "Cuando un look te guste, tocá Guardar para tenerlo siempre a mano." : tab === "usados" ? "Marcá \"Lo uso hoy\" en un outfit para llevar el registro de lo que te ponés." : "Generá tu primer outfit y lo vas a encontrar acá."}
          action={<Link to="/outfit"><Button>Ir a Outfit Exprés</Button></Link>}
        />
      )}

      <ul className="grid gap-3 lg:grid-cols-2">
        {visible.map((o) => {
          const wornToday = o.outfit_wears.some((w) => w.worn_on === today);
          return (
            <li key={o.id} className="card flex gap-4 p-4 animate-fade-up">
              <button type="button" onClick={() => setOpenId(o.id)} className="min-w-0 flex-1 text-left">
                <OutfitStrip items={o.items} size="sm" />
                <p className="eyebrow mt-2.5 !text-[10px]">{meta(o)}</p>
                <p className="mt-1 line-clamp-2 text-[13px] leading-relaxed text-graphite">{o.explanation}</p>
              </button>
              <div className="flex shrink-0 flex-col items-center gap-1">
                <IconButton label={o.is_saved ? "Quitar de guardados" : "Guardar outfit"} active={o.is_saved} onClick={() => act(() => actions.update(o.id, { is_saved: !o.is_saved }))} className="h-9 w-9">
                  <Bookmark className="h-4 w-4" fill={o.is_saved ? "currentColor" : "none"} />
                </IconButton>
                <IconButton label={wornToday ? "Quitar uso de hoy" : "Lo uso hoy"} active={wornToday} onClick={() => toggleWear(o)} className="h-9 w-9"><Check className="h-4 w-4" /></IconButton>
                {o.rating !== null && <span className="flex h-9 w-9 items-center justify-center text-graphite" title={o.rating === 1 ? "Te gustó" : "No te gustó"}>{o.rating === 1 ? <ThumbsUp className="h-4 w-4" /> : <ThumbsDown className="h-4 w-4" />}</span>}
              </div>
            </li>
          );
        })}
      </ul>

      {tab === "historial" && hiddenByPlan > 0 && (
        <Link to="/premium" className="mt-4 flex items-center gap-3 rounded-card bg-mist p-4 text-sm transition-colors hover:bg-black/[0.08]">
          <Lock className="h-4 w-4 shrink-0 text-crimson" />
          <span>Tu plan muestra los últimos {historyDays} días. Hay {hiddenByPlan} {hiddenByPlan === 1 ? "outfit anterior" : "outfits anteriores"}: con <span className="font-semibold">Premium</span> ves todo tu historial.</span>
        </Link>
      )}

      {open && (
        <Sheet open onClose={() => setOpenId(null)} size="lg" title={meta(open)}
          footer={
            <div className="flex items-center gap-2">
              <Button className="flex-1" variant={open.outfit_wears.some((w) => w.worn_on === today) ? "primary" : "dark"} onClick={() => toggleWear(open)} icon={<Check className="h-4 w-4" />}>
                {open.outfit_wears.some((w) => w.worn_on === today) ? "Usado hoy" : "Lo uso hoy"}
              </Button>
              <Button variant={open.is_saved ? "primary" : "outline"} onClick={() => act(() => actions.update(open.id, { is_saved: !open.is_saved }))} icon={<Bookmark className="h-4 w-4" fill={open.is_saved ? "currentColor" : "none"} />}>
                {open.is_saved ? "Guardado" : "Guardar"}
              </Button>
              <IconButton label="Eliminar outfit" onClick={() => setDeleting(open)} className="border border-black/12 hover:!bg-crimson-soft hover:text-crimson"><Trash2 className="h-4 w-4" /></IconButton>
            </div>
          }
        >
          <OutfitGrid items={open.items} />
          {open.request_text && <p className="mt-5 w-fit rounded-2xl rounded-bl-md bg-mist px-4 py-2.5 text-sm">{open.request_text}</p>}
          <p className="mt-4 text-[15px] leading-relaxed">{open.explanation}</p>
          {open.weather && (
            <p className="mt-3 text-xs text-graphite">
              Pensado para {Math.round(open.weather.feelsLikeC)}° de sensación térmica, {open.weather.rain ? "con lluvia" : "sin lluvia"}{open.weather.simulated ? " (escenario simulado)" : ""}.
            </p>
          )}
          <div className="mt-4 flex items-center gap-2">
            <span className="text-xs text-graphite">Tu valoración:</span>
            {([1, -1] as const).map((value) => (
              <button key={value} type="button" aria-label={value === 1 ? "Me gustó" : "No me gustó"} aria-pressed={open.rating === value}
                onClick={() => act(() => actions.update(open.id, { rating: open.rating === value ? null : value }))}
                className={cx("flex h-9 w-9 items-center justify-center rounded-full border transition-all active:scale-90", open.rating === value ? (value === 1 ? "border-ink bg-ink text-white" : "border-crimson bg-crimson text-white") : "border-black/12 hover:border-ink")}>
                {value === 1 ? <ThumbsUp className="h-4 w-4" /> : <ThumbsDown className="h-4 w-4" />}
              </button>
            ))}
            {open.outfit_wears.length > 0 && <span className="ml-auto text-xs text-graphite">Usado {open.outfit_wears.length} {open.outfit_wears.length === 1 ? "vez" : "veces"}</span>}
          </div>
        </Sheet>
      )}

      <ConfirmDialog open={Boolean(deleting)} title="Eliminar outfit" text="Vas a eliminar este outfit de tu historial, junto con sus usos registrados. Tus prendas no se modifican."
        confirmLabel="Eliminar" loading={busy} onConfirm={confirmDelete} onClose={() => setDeleting(null)} />
    </>
  );
}
