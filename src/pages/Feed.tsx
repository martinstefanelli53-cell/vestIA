// "Mi inspiración": referencias privadas de la persona. La app detecta las prendas de
// cada foto y arma versiones parecidas con el guardarropa de la persona.
import { useCallback, useMemo, useRef, useState } from "react";
import { Camera, Check, Compass, Gift, ImagePlus, Plus, Trash2 } from "lucide-react";
import { InspirationSheet, type InspirationDraft, type InspirationStatus } from "@/components/Inspiration";
import { useToast } from "@/components/Toast";
import { Button, ColorDot, cx, EmptyState, PageHeader, Segmented, Skeleton } from "@/components/ui";
import {
  friendlyError, isLimitError, signedImageUrl, useAddToWishlist, useDeleteInspiration, useDeleteWishlistItem, useGarments, useInspirations,
  useOutfitActions, useOutfits, useProfile, useSaveInspiration, useUpdateInspiration, useUpdateWishlistItem, useWishlist, type Inspiration, type WishlistItem,
} from "@/hooks/data";
import { useWeather } from "@/hooks/weather";
import { capitalize, currentSeason } from "@/lib/format";
import { ACCEPTED_IMAGE_TYPES, prepareImage, validateImage } from "@/lib/image";
import { detectPieces, InspirationError, type InspirationPiece } from "@/lib/inspirationVision";
import { EMPTY_INTENT, evaluateOutfit } from "@/styling/engine";
import { pieceLabel } from "@/styling/inspiration";

interface Open {
  draft: InspirationDraft;
  file?: File; // solo en referencias nuevas
  thumb?: Blob;
  saved?: Inspiration;
  dirty: boolean;
}

export function FeedPage() {
  const toast = useToast();
  const { data: items, isLoading, isError, refetch } = useInspirations();
  const { data: garments = [] } = useGarments();
  const { data: profile } = useProfile();
  const { data: outfits } = useOutfits();
  const { styling } = useWeather();
  const save = useSaveInspiration();
  const update = useUpdateInspiration();
  const remove = useDeleteInspiration();
  const actions = useOutfitActions();
  const { data: wishlist = [] } = useWishlist();
  const addWish = useAddToWishlist();
  const updateWish = useUpdateWishlistItem();
  const deleteWish = useDeleteWishlistItem();
  const [tab, setTab] = useState<"referencias" | "deseos">("referencias");
  const camera = useRef<HTMLInputElement>(null);
  const gallery = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState<Open | null>(null);
  const [status, setStatus] = useState<InspirationStatus>({ state: "idle" });
  const [limitOpen, setLimitOpen] = useState(false);

  const season = currentSeason(profile?.location_lat);

  // Criterio del motor de estilismo (clima, preferencias, colores) para ordenar las versiones.
  const scoreItems = useCallback((chosen: typeof garments) => {
    if (!profile) return 0.5;
    return evaluateOutfit({
      garments, profile, weather: styling, season, intent: EMPTY_INTENT,
      history: (outfits ?? []).map((o) => ({ ids: o.outfit_items.map((i) => i.garment_id), rating: o.rating })),
    }, chosen).score;
  }, [garments, profile, styling, season, outfits]);

  const startNew = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    const problem = validateImage(file);
    if (problem) { toast(problem, "error"); return; }
    try {
      const prepared = await prepareImage(file);
      setOpen({ draft: { imageUrl: URL.createObjectURL(file), title: "", pieces: [] }, file, thumb: prepared.thumb, dirty: false });
      setStatus({ state: "detecting" });
      try {
        const pieces = await detectPieces(file, (progress) => setStatus({ state: "detecting", progress }));
        setOpen((o) => o && { ...o, draft: { ...o.draft, pieces } });
        setStatus({ state: "idle" });
      } catch (e) {
        console.error(e);
        setStatus({ state: "error", message: e instanceof InspirationError ? e.message : "No pudimos analizar la foto. Podés agregar las prendas a mano." });
      }
    } catch (e) {
      toast(friendlyError(e), "error");
    }
  };

  const openSaved = async (item: Inspiration) => {
    setStatus({ state: "idle" });
    setOpen({ draft: { id: item.id, imageUrl: item.imageUrl, title: item.title, pieces: item.pieces }, saved: item, dirty: false });
    const full = await signedImageUrl(item.image_path); // la foto completa se pide al abrir
    if (full) setOpen((o) => (o?.saved?.id === item.id ? { ...o, draft: { ...o.draft, imageUrl: full } } : o));
  };

  const close = () => {
    if (open?.draft.imageUrl?.startsWith("blob:")) URL.revokeObjectURL(open.draft.imageUrl);
    setOpen(null);
    setStatus({ state: "idle" });
  };

  const onChange = (draft: InspirationDraft) => setOpen((o) => o && { ...o, draft, dirty: true });

  /** Guarda (o actualiza) la referencia abierta y devuelve su id. */
  const saveReference = async (): Promise<string | null> => {
    if (!open) return null;
    const { draft } = open;
    try {
      if (open.saved) {
        await update.mutateAsync({ id: open.saved.id, title: draft.title.trim(), pieces: draft.pieces });
        setOpen({ ...open, dirty: false });
        toast("Cambios guardados");
        return open.saved.id;
      }
      if (draft.id) return draft.id;
      if (open.file && open.thumb) {
        const row = await save.mutateAsync({ file: open.file, thumb: open.thumb, title: draft.title.trim(), pieces: draft.pieces });
        setOpen({ ...open, draft: { ...draft, id: row.id }, saved: undefined, dirty: false, file: undefined, thumb: undefined });
        toast("Referencia guardada en tu inspiración");
        return row.id;
      }
    } catch (e) {
      toast(friendlyError(e), "error");
    }
    return null;
  };
  const onSave = async () => { await saveReference(); };

  const onAddToWishlist = async (pieces: InspirationPiece[]) => {
    const id = open?.draft.id ?? (await saveReference());
    if (!id || !open) throw new Error("no-reference");
    try {
      await addWish.mutateAsync({ inspirationId: id, sourceTitle: open.draft.title.trim(), pieces });
    } catch (e) {
      toast(friendlyError(e), "error");
      throw e;
    }
  };

  const onSaveOutfit = async (chosen: typeof garments, explanation: string) => {
    try {
      const outfit = await actions.create({
        items: chosen, occasion: null, request_text: open?.draft.title ? `Inspiración: ${open.draft.title}` : "Inspiración", explanation,
        source: "engine", weather: styling, rain_mode: "real",
      });
      await actions.update(outfit.id, { is_saved: true });
    } catch (e) {
      if (isLimitError(e)) setLimitOpen(true); else toast(friendlyError(e), "error");
      throw e;
    }
  };

  const onDelete = async () => {
    const target = open?.saved ?? items?.find((i) => i.id === open?.draft.id);
    if (!target) return;
    try {
      await remove.mutateAsync(target);
      toast("Referencia eliminada");
      close();
    } catch (e) {
      toast(friendlyError(e), "error");
    }
  };

  const list = useMemo(() => items ?? [], [items]);
  const saving = save.isPending || update.isPending;

  return (
    <>
      <PageHeader
        overline="Tus referencias"
        title="Mi inspiración"
        action={
          <div className={cx("hidden gap-2", tab === "referencias" && "sm:flex")}>
            <Button variant="outline" icon={<Camera className="h-4 w-4" />} onClick={() => camera.current?.click()}>Sacar foto</Button>
            <Button icon={<Plus className="h-4 w-4" />} onClick={() => gallery.current?.click()}>Agregar referencia</Button>
          </div>
        }
      />
      <p className="-mt-3 mb-6 max-w-xl text-sm leading-relaxed text-graphite">
        Subí una foto de un look que te guste, de Pinterest, de la calle o de una vidriera. VESTIA detecta sus prendas y arma una versión parecida con lo que ya tenés en tu guardarropa.
      </p>

      <div className="mb-6 max-w-sm">
        <Segmented
          ariaLabel="Secciones de inspiración"
          value={tab}
          onChange={setTab}
          options={[
            { value: "referencias", label: "Referencias" },
            { value: "deseos", label: `Lista de deseos${wishlist.filter((w) => !w.acquired).length ? ` (${wishlist.filter((w) => !w.acquired).length})` : ""}` },
          ]}
        />
      </div>

      <div className={cx("mb-6 flex gap-2 sm:hidden", tab !== "referencias" && "hidden")}>
        <Button className="flex-1" icon={<Plus className="h-4 w-4" />} onClick={() => gallery.current?.click()}>Agregar referencia</Button>
        <Button variant="outline" aria-label="Sacar foto" icon={<Camera className="h-4 w-4" />} onClick={() => camera.current?.click()} />
      </div>
      <input ref={camera} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { void startNew(e.target.files); e.target.value = ""; }} />
      <input ref={gallery} type="file" accept={ACCEPTED_IMAGE_TYPES.join(",")} hidden data-testid="inspiration-input" onChange={(e) => { void startNew(e.target.files); e.target.value = ""; }} />

      {tab === "referencias" && isLoading && <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="aspect-[4/5]" />)}</div>}
      {tab === "referencias" && isError && <EmptyState title="No pudimos cargar tus referencias" text="Revisá tu conexión e intentá de nuevo." action={<button type="button" className="text-sm font-medium text-crimson underline" onClick={() => refetch()}>Reintentar</button>} />}
      {tab === "referencias" && !isLoading && !isError && list.length === 0 && (
        <EmptyState
          icon={<Compass className="h-5 w-5" />}
          title="Todavía no guardaste inspiración"
          text="Sumá tu primera referencia: una foto de un look que te guste. Te mostramos cómo armarlo con tu ropa."
          action={<Button icon={<ImagePlus className="h-4 w-4" />} onClick={() => gallery.current?.click()}>Elegir una foto</Button>}
        />
      )}

      {tab === "deseos" && (
        <WishlistView items={wishlist} looks={list} onToggle={(w) => updateWish.mutate({ id: w.id, acquired: !w.acquired })} onDelete={(w) => deleteWish.mutate(w.id)}
          onOpenLook={(item) => { setTab("referencias"); void openSaved(item); }} />
      )}

      <ul className={cx("grid grid-cols-2 gap-x-4 gap-y-7 sm:grid-cols-3 lg:grid-cols-4", tab !== "referencias" && "hidden")}>
        {list.map((item) => (
          <li key={item.id} className="animate-fade-up">
            <button type="button" onClick={() => void openSaved(item)} className="group block w-full text-left">
              <div className="aspect-[4/5] overflow-hidden rounded-card bg-mist transition-shadow group-hover:shadow-md">
                {item.imageUrl && <img src={item.imageUrl} alt={item.title || "Referencia de inspiración"} className="h-full w-full object-cover" loading="lazy" />}
              </div>
              <p className="mt-2.5 truncate text-sm font-medium">{item.title || `${item.pieces.length} prendas detectadas`}</p>
              <div className="mt-1 flex items-center gap-1" aria-label={item.pieces.map((p) => capitalize(pieceLabel(p))).join(", ")}>
                {item.pieces.slice(0, 6).map((p, i) => <ColorDot key={i} color={p.color} size={12} />)}
              </div>
            </button>
          </li>
        ))}
      </ul>

      <InspirationSheet
        draft={open?.draft ?? null}
        status={status}
        garments={garments}
        saving={saving}
        dirty={Boolean(open?.dirty)}
        onChange={onChange}
        onSave={onSave}
        onDelete={open?.draft.id ? onDelete : undefined}
        onClose={close}
        scoreItems={scoreItems}
        onSaveOutfit={onSaveOutfit}
        limitOpen={limitOpen}
        onLimitClose={() => setLimitOpen(false)}
        wishlist={wishlist}
        onAddToWishlist={onAddToWishlist}
      />
    </>
  );
}

function WishlistView({ items, looks, onToggle, onDelete, onOpenLook }: {
  items: WishlistItem[]; looks: Inspiration[]; onToggle: (w: WishlistItem) => void; onDelete: (w: WishlistItem) => void; onOpenLook: (i: Inspiration) => void;
}) {
  if (items.length === 0) {
    return (
      <EmptyState
        icon={<Gift className="h-5 w-5" />}
        title="Tu lista de deseos está vacía"
        text="Cuando armes la versión de un look y te falte alguna prenda, podés agregarla acá para tenerla presente."
      />
    );
  }
  // Agrupadas por el look que las originó.
  const groups = new Map<string, WishlistItem[]>();
  for (const item of items) {
    const key = item.inspiration_id ?? `otro:${item.source_title}`;
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  return (
    <div className="space-y-6">
      {[...groups.entries()].map(([key, group]) => {
        const look = looks.find((l) => l.id === group[0].inspiration_id);
        const title = look?.title || group[0].source_title || (look ? "Look sin nombre" : "Look eliminado");
        return (
          <section key={key} className="rounded-card border border-black/[0.08] p-4 animate-fade-up">
            <div className="flex items-center gap-3">
              <div className="h-14 w-11 shrink-0 overflow-hidden rounded-lg bg-mist">
                {look?.imageUrl && <img src={look.imageUrl} alt="" className="h-full w-full object-cover" />}
              </div>
              <div className="min-w-0 flex-1">
                <p className="eyebrow !text-[10px]">Para este look</p>
                <p className="truncate text-sm font-semibold">{title}</p>
              </div>
              {look && <Button variant="outline" size="sm" onClick={() => onOpenLook(look)}>Ver look</Button>}
            </div>
            <ul className="mt-3 divide-y divide-black/[0.06]">
              {group.map((w) => (
                <li key={w.id} className="flex items-center gap-3 py-2.5">
                  <button type="button" role="checkbox" aria-checked={w.acquired} aria-label={`Marcar ${w.type} ${w.color} como conseguida`} onClick={() => onToggle(w)}
                    className={cx("flex h-6 w-6 shrink-0 items-center justify-center rounded-full border transition-colors", w.acquired ? "border-ink bg-ink text-white" : "border-black/25 hover:border-ink")}>
                    {w.acquired && <Check className="h-3.5 w-3.5" />}
                  </button>
                  <ColorDot color={w.color} size={14} />
                  <span className={cx("min-w-0 flex-1 truncate text-sm", w.acquired && "text-graphite line-through")}>{capitalize(pieceLabel(w))}</span>
                  <button type="button" aria-label={`Quitar ${w.type} ${w.color} de la lista`} onClick={() => onDelete(w)}
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-graphite transition-colors hover:bg-mist hover:text-ink"><Trash2 className="h-4 w-4" /></button>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
