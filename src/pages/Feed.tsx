// "Mi inspiración": referencias privadas de la persona. La app detecta las prendas de
// cada foto y arma versiones parecidas con el guardarropa de la persona.
import { useCallback, useMemo, useRef, useState } from "react";
import { Camera, Compass, ImagePlus, Plus } from "lucide-react";
import { InspirationSheet, type InspirationDraft, type InspirationStatus } from "@/components/Inspiration";
import { useToast } from "@/components/Toast";
import { Button, ColorDot, EmptyState, PageHeader, Skeleton } from "@/components/ui";
import {
  friendlyError, isLimitError, signedImageUrl, useDeleteInspiration, useGarments, useInspirations, useOutfitActions, useOutfits,
  useProfile, useSaveInspiration, useUpdateInspiration, type Inspiration,
} from "@/hooks/data";
import { useWeather } from "@/hooks/weather";
import { capitalize, currentSeason } from "@/lib/format";
import { ACCEPTED_IMAGE_TYPES, prepareImage, validateImage } from "@/lib/image";
import { detectPieces, InspirationError } from "@/lib/inspirationVision";
import { EMPTY_INTENT, evaluateOutfit } from "@/styling/engine";

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

  const onSave = async () => {
    if (!open) return;
    const { draft } = open;
    try {
      if (open.saved) {
        await update.mutateAsync({ id: open.saved.id, title: draft.title.trim(), pieces: draft.pieces });
        setOpen({ ...open, dirty: false });
        toast("Cambios guardados");
      } else if (open.file && open.thumb) {
        const row = await save.mutateAsync({ file: open.file, thumb: open.thumb, title: draft.title.trim(), pieces: draft.pieces });
        setOpen({ ...open, draft: { ...draft, id: row.id }, saved: undefined, dirty: false, file: undefined, thumb: undefined });
        toast("Referencia guardada en tu inspiración");
      }
    } catch (e) {
      toast(friendlyError(e), "error");
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
          <div className="hidden gap-2 sm:flex">
            <Button variant="outline" icon={<Camera className="h-4 w-4" />} onClick={() => camera.current?.click()}>Sacar foto</Button>
            <Button icon={<Plus className="h-4 w-4" />} onClick={() => gallery.current?.click()}>Agregar referencia</Button>
          </div>
        }
      />
      <p className="-mt-3 mb-6 max-w-xl text-sm leading-relaxed text-graphite">
        Subí una foto de un look que te guste, de Pinterest, de la calle o de una vidriera. VESTIA detecta sus prendas y arma una versión parecida con lo que ya tenés en tu guardarropa.
      </p>

      <div className="mb-6 flex gap-2 sm:hidden">
        <Button className="flex-1" icon={<Plus className="h-4 w-4" />} onClick={() => gallery.current?.click()}>Agregar referencia</Button>
        <Button variant="outline" aria-label="Sacar foto" icon={<Camera className="h-4 w-4" />} onClick={() => camera.current?.click()} />
      </div>
      <input ref={camera} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { void startNew(e.target.files); e.target.value = ""; }} />
      <input ref={gallery} type="file" accept={ACCEPTED_IMAGE_TYPES.join(",")} hidden data-testid="inspiration-input" onChange={(e) => { void startNew(e.target.files); e.target.value = ""; }} />

      {isLoading && <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="aspect-[4/5]" />)}</div>}
      {isError && <EmptyState title="No pudimos cargar tus referencias" text="Revisá tu conexión e intentá de nuevo." action={<button type="button" className="text-sm font-medium text-crimson underline" onClick={() => refetch()}>Reintentar</button>} />}
      {!isLoading && !isError && list.length === 0 && (
        <EmptyState
          icon={<Compass className="h-5 w-5" />}
          title="Todavía no guardaste inspiración"
          text="Sumá tu primera referencia: una foto de un look que te guste. Te mostramos cómo armarlo con tu ropa."
          action={<Button icon={<ImagePlus className="h-4 w-4" />} onClick={() => gallery.current?.click()}>Elegir una foto</Button>}
        />
      )}

      <ul className="grid grid-cols-2 gap-x-4 gap-y-7 sm:grid-cols-3 lg:grid-cols-4">
        {list.map((item) => (
          <li key={item.id} className="animate-fade-up">
            <button type="button" onClick={() => void openSaved(item)} className="group block w-full text-left">
              <div className="aspect-[4/5] overflow-hidden rounded-card bg-mist transition-shadow group-hover:shadow-md">
                {item.imageUrl && <img src={item.imageUrl} alt={item.title || "Referencia de inspiración"} className="h-full w-full object-cover" loading="lazy" />}
              </div>
              <p className="mt-2.5 truncate text-sm font-medium">{item.title || `${item.pieces.length} prendas detectadas`}</p>
              <div className="mt-1 flex items-center gap-1" aria-label={item.pieces.map((p) => `${capitalize(p.type)} ${p.color}`).join(", ")}>
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
      />
    </>
  );
}
