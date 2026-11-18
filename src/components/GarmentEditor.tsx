// Alta y edición de prendas: fotos (cámara o galería), reconocimiento
// automático y ficha editable. La clasificación siempre puede corregirse.
import { useEffect, useRef, useState } from "react";
import { Camera, ImagePlus, Lightbulb, Sparkles, Undo2, Wand2, X } from "lucide-react";
import {
  CATEGORIES, CATEGORY_LABELS, COLOR_NAMES, FITS, MATERIALS, PATTERNS, SEASONS, STYLES, TYPES_BY_CATEGORY,
  type Category, type ClassificationResult, type Fit, type GarmentAttributes,
} from "@shared/taxonomy.ts";
import { api, ApiError } from "@/lib/api";
import { capitalize } from "@/lib/format";
import { defaultAttributes, FORMALITY_LABELS, levelsFor, WARMTH_LABELS } from "@/lib/garmentDefaults";
import { ACCEPTED_IMAGE_TYPES, prepareImage, validateImage } from "@/lib/image";
import type { Garment, GarmentImage } from "@/lib/types";
import { friendlyError, isLimitError, signedImageUrl, useBackendStatus, useSaveGarment, type NewImage } from "@/hooks/data";
import { CutoutError, cleanGarmentPhoto } from "@/lib/cutout";
import { analyzeGarmentLocally } from "@/lib/localVision";
import { LimitSheet } from "./Plan";
import { useToast } from "./Toast";
import { Button, Chip, ChipGroup, ColorPicker, cx, Field, Segmented, Sheet, Spinner } from "./ui";

type Attributes = GarmentAttributes & { notes: string | null };
// `original` guarda la foto sin retocar cuando se aplicó "Fondo limpio".
interface Draft extends NewImage { preview: string; original?: Draft }
type Analysis = { state: "idle" } | { state: "running"; progress?: number } | { state: "ai" } | { state: "local" } | { state: "colors" } | { state: "not-garment" };

const MAX_PHOTOS = 5;

function toAttributes(garment: Garment): Attributes {
  const { name, category, type, primary_color, secondary_colors, pattern, styles, seasons, material, fit, warmth, formality, waterproof, notes } = garment;
  return { name, category, type, primary_color, secondary_colors, pattern, styles, seasons, material, fit, warmth, formality, waterproof, notes };
}

function LevelField({ label, value, labels, onChange }: { label: string; value: number; labels: string[]; onChange: (n: number) => void }) {
  return (
    <Field label={label} hint={labels[value - 1]}>
      <Segmented ariaLabel={label} value={value} onChange={onChange} options={[1, 2, 3, 4, 5].map((n) => ({ value: n, label: String(n) }))} />
    </Field>
  );
}

interface Props {
  open: boolean;
  garment?: Garment | null;
  onClose: () => void;
}

export function GarmentEditor({ open, garment, onClose }: Props) {
  const editing = Boolean(garment);
  const save = useSaveGarment();
  const { data: backend } = useBackendStatus();
  const toast = useToast();
  const cameraInput = useRef<HTMLInputElement>(null);
  const galleryInput = useRef<HTMLInputElement>(null);

  const [attrs, setAttrs] = useState<Attributes>(defaultAttributes());
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [existing, setExisting] = useState<(GarmentImage & { url: string | null })[]>([]);
  const [removed, setRemoved] = useState<GarmentImage[]>([]);
  const [analysis, setAnalysis] = useState<Analysis>({ state: "idle" });
  const [aiClassified, setAiClassified] = useState(false);
  const [levelsTouched, setLevelsTouched] = useState(false);
  const [limitOpen, setLimitOpen] = useState(false);
  const [cleaning, setCleaning] = useState<{ key: string; progress?: number } | null>(null);

  const reset = (source?: Garment | null) => {
    drafts.forEach((d) => { URL.revokeObjectURL(d.preview); if (d.original) URL.revokeObjectURL(d.original.preview); });
    setAttrs(source ? toAttributes(source) : defaultAttributes());
    setDrafts([]);
    setRemoved([]);
    setExisting([]);
    setAnalysis({ state: "idle" });
    setAiClassified(false);
    setLevelsTouched(Boolean(source));
  };

  useEffect(() => {
    if (!open) return;
    reset(garment);
    if (garment) {
      let cancelled = false;
      Promise.all(garment.garment_images.map(async (img) => ({ ...img, url: await signedImageUrl(img.thumb_path ?? img.storage_path) })))
        .then((list) => !cancelled && setExisting(list));
      return () => { cancelled = true; };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, garment?.id]);

  const set = <K extends keyof Attributes>(key: K, value: Attributes[K]) => setAttrs((a) => ({ ...a, [key]: value }));

  const changeCategory = (category: Category) => {
    const type = TYPES_BY_CATEGORY[category][0];
    setAttrs((a) => ({
      ...a, category, type,
      fit: category === "shoes" || category === "accessory" ? null : a.fit ?? "regular",
      ...(levelsTouched ? {} : levelsFor(type)),
    }));
  };
  const changeType = (type: string) => setAttrs((a) => ({ ...a, type, ...(levelsTouched ? {} : levelsFor(type)) }));

  /** Reconoce la prenda con IA; si no está disponible, usa el análisis de color local. */
  const analyze = async (draft: Draft & { aiBase64: string; colors: { primary: string; secondary: string[] } }) => {
    setAnalysis({ state: "running" });
    if (backend?.ai) {
      try {
        const result = await api<ClassificationResult>("/ai/classify", { body: { image: draft.aiBase64, mediaType: "image/jpeg" } });
        if (!result.is_garment) {
          setAttrs((a) => ({ ...a, primary_color: draft.colors.primary, secondary_colors: draft.colors.secondary }));
          setAnalysis({ state: "not-garment" });
          return;
        }
        const { is_garment: _is, confidence: _confidence, ...fields } = result;
        setAttrs((a) => ({ ...a, ...fields }));
        setAiClassified(true);
        setLevelsTouched(true);
        setAnalysis({ state: "ai" });
        return;
      } catch (error) {
        if (!(error instanceof ApiError)) console.error(error);
      }
    }
    // Sin IA en el servidor: modelo gratuito que corre en el navegador.
    try {
      const local = await analyzeGarmentLocally(draft.thumb, (progress) => setAnalysis({ state: "running", progress }));
      if (!local.isGarment) {
        setAttrs((a) => ({ ...a, primary_color: draft.colors.primary, secondary_colors: draft.colors.secondary }));
        setAnalysis({ state: "not-garment" });
        return;
      }
      setAttrs((a) => ({ ...a, ...local.fields, primary_color: draft.colors.primary, secondary_colors: draft.colors.secondary }));
      setAiClassified(true);
      setLevelsTouched(true);
      setAnalysis({ state: "local" });
      return;
    } catch (error) {
      console.error("Reconocimiento local no disponible", error);
    }
    setAttrs((a) => ({ ...a, primary_color: draft.colors.primary, secondary_colors: draft.colors.secondary }));
    setAnalysis({ state: "colors" });
  };

  const addFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    const room = MAX_PHOTOS - drafts.length - existing.length;
    if (room <= 0) { toast(`Podés cargar hasta ${MAX_PHOTOS} fotos por prenda.`, "error"); return; }
    const isFirstPhoto = !editing && drafts.length === 0;
    const added: (Draft & { aiBase64: string; colors: { primary: string; secondary: string[] } })[] = [];
    for (const file of Array.from(files).slice(0, room)) {
      const problem = validateImage(file);
      if (problem) { toast(problem, "error"); continue; }
      try {
        const prepared = await prepareImage(file);
        added.push({ file, thumb: prepared.thumb, preview: URL.createObjectURL(prepared.thumb), aiBase64: prepared.aiBase64, colors: prepared.colors });
      } catch (e) {
        toast(friendlyError(e), "error");
      }
    }
    if (!added.length) return;
    setDrafts((list) => [...list, ...added.map(({ file, thumb, preview }) => ({ file, thumb, preview }))]);
    if (isFirstPhoto) void analyze(added[0]);
  };

  /** Quita el fondo y centra la prenda; la foto original se conserva. */
  const cleanDraft = async (index: number) => {
    const draft = drafts[index];
    if (!draft || cleaning) return;
    setCleaning({ key: draft.preview });
    try {
      const blob = await cleanGarmentPhoto(draft.file, (progress) => setCleaning({ key: draft.preview, progress }));
      const file = new File([blob], "fondo-limpio.jpg", { type: "image/jpeg" });
      const prepared = await prepareImage(file);
      const cleaned: Draft = { file, thumb: prepared.thumb, preview: URL.createObjectURL(prepared.thumb), original: draft };
      setDrafts((list) => list.map((d) => (d.preview === draft.preview ? cleaned : d)));
    } catch (e) {
      toast(e instanceof CutoutError ? e.message : "No pudimos limpiar el fondo de esta foto. Podés usar la original.", "error");
    } finally {
      setCleaning(null);
    }
  };

  const restoreDraft = (index: number) => setDrafts((list) => list.map((d, i) => {
    if (i !== index || !d.original) return d;
    URL.revokeObjectURL(d.preview);
    return d.original;
  }));

  const removeDraft = (index: number) => setDrafts((list) => {
    URL.revokeObjectURL(list[index].preview);
    if (list[index].original) URL.revokeObjectURL(list[index].original!.preview);
    return list.filter((_, i) => i !== index);
  });

  const submit = async (another: boolean) => {
    const name = attrs.name.trim() || `${capitalize(attrs.type)} ${attrs.primary_color}`;
    try {
      await save.mutateAsync({
        id: garment?.id,
        attributes: { ...attrs, name, notes: attrs.notes?.trim() || null, secondary_colors: attrs.secondary_colors.filter((c) => c !== attrs.primary_color) },
        aiClassified,
        // Con fondo limpio se guarda esa versión como portada y la original como segunda foto.
        newImages: drafts.flatMap((d) => (d.original ? [{ file: d.file, thumb: d.thumb }, { file: d.original.file, thumb: d.original.thumb }] : [{ file: d.file, thumb: d.thumb }])),
        removedImages: removed,
        existingImageCount: garment?.garment_images.length ?? 0,
      });
      toast(editing ? "Cambios guardados" : "Prenda agregada a tu guardarropa");
      if (another) reset(null); else onClose();
    } catch (e) {
      if (isLimitError(e)) setLimitOpen(true);
      else toast(friendlyError(e), "error");
    }
  };

  const photoCount = drafts.length + existing.length;
  const analyzing = analysis.state === "running";

  return (
    <>
      <Sheet
        open={open}
        onClose={onClose}
        size="lg"
        title={editing ? "Editar prenda" : "Nueva prenda"}
        footer={
          <div className="flex gap-2">
            {!editing && <Button variant="outline" disabled={analyzing} loading={save.isPending} onClick={() => submit(true)}>Guardar y cargar otra</Button>}
            <Button className="flex-1" disabled={analyzing} loading={save.isPending} onClick={() => submit(false)}>{editing ? "Guardar cambios" : "Guardar prenda"}</Button>
          </div>
        }
      >
        <div className="space-y-6">
          {/* Fotos */}
          <section>
            <div className="mb-2 flex items-baseline justify-between">
              <h3 className="text-[13px] font-medium">Fotos</h3>
              <span className="text-xs text-graphite">{photoCount} de {MAX_PHOTOS} · la primera es la portada</span>
            </div>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
              {existing.map((img) => (
                <div key={img.id} className="relative aspect-[4/5] overflow-hidden rounded-xl bg-mist">
                  {img.url && <img src={img.url} alt="" className="h-full w-full object-cover" />}
                  <button type="button" aria-label="Quitar foto" onClick={() => { setExisting((l) => l.filter((i) => i.id !== img.id)); setRemoved((l) => [...l, img]); }}
                    className="absolute right-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-ink/75 text-white transition-transform active:scale-90"><X className="h-4 w-4" /></button>
                </div>
              ))}
              {drafts.map((draft, index) => (
                <div key={draft.preview} className="relative aspect-[4/5] overflow-hidden rounded-xl bg-mist animate-fade-in">
                  <img src={draft.preview} alt={`Vista previa ${index + 1}`} className="h-full w-full object-cover" />
                  <button type="button" aria-label="Quitar foto" onClick={() => removeDraft(index)}
                    className="absolute right-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-ink/75 text-white transition-transform active:scale-90"><X className="h-4 w-4" /></button>
                  {cleaning?.key === draft.preview ? (
                    <div role="status" className="absolute inset-x-1.5 bottom-1.5 flex items-center justify-center gap-1.5 rounded-full bg-ink/85 px-2 py-1.5 text-[11px] font-medium text-white">
                      <Spinner className="h-3 w-3" /> {cleaning.progress !== undefined && cleaning.progress < 100 ? `Preparando ${cleaning.progress} %` : "Limpiando…"}
                    </div>
                  ) : draft.original ? (
                    <button type="button" onClick={() => restoreDraft(index)} className="absolute inset-x-1.5 bottom-1.5 flex items-center justify-center gap-1.5 rounded-full bg-white/95 px-2 py-1.5 text-[11px] font-medium shadow-sm transition-transform active:scale-95">
                      <Undo2 className="h-3 w-3" /> Usar original
                    </button>
                  ) : (
                    <button type="button" disabled={Boolean(cleaning)} onClick={() => void cleanDraft(index)} className="absolute inset-x-1.5 bottom-1.5 flex items-center justify-center gap-1.5 rounded-full bg-white/95 px-2 py-1.5 text-[11px] font-medium shadow-sm transition-transform active:scale-95 disabled:opacity-50">
                      <Wand2 className="h-3 w-3" /> Fondo limpio
                    </button>
                  )}
                </div>
              ))}
              {photoCount < MAX_PHOTOS && (
                <>
                  <button type="button" onClick={() => cameraInput.current?.click()} className="flex aspect-[4/5] flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-black/20 text-xs font-medium text-graphite transition-colors hover:border-ink hover:text-ink">
                    <Camera className="h-5 w-5" /> Sacar foto
                  </button>
                  <button type="button" onClick={() => galleryInput.current?.click()} className="flex aspect-[4/5] flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-black/20 text-xs font-medium text-graphite transition-colors hover:border-ink hover:text-ink">
                    <ImagePlus className="h-5 w-5" /> Galería
                  </button>
                </>
              )}
            </div>
            <input ref={cameraInput} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { void addFiles(e.target.files); e.target.value = ""; }} />
            <input ref={galleryInput} type="file" accept={ACCEPTED_IMAGE_TYPES.join(",")} multiple hidden data-testid="gallery-input" onChange={(e) => { void addFiles(e.target.files); e.target.value = ""; }} />
            <details className="group mt-3 rounded-xl bg-mist px-3.5 py-3 text-[13px] leading-relaxed" open={!editing && photoCount === 0}>
              <summary className="flex cursor-pointer list-none items-center gap-2 font-medium">
                <Lightbulb className="h-4 w-4 text-crimson" /> Cómo sacar una buena foto
              </summary>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-graphite">
                <li><strong className="font-medium text-ink">Una sola prenda por foto,</strong> entera y sin que se corte ningún borde.</li>
                <li><strong className="font-medium text-ink">Fondo liso que contraste:</strong> prenda clara sobre fondo oscuro, y al revés. Evitá blanco sobre blanco.</li>
                <li><strong className="font-medium text-ink">Apoyala plana</strong> sobre una cama, el piso o una mesa lisa, estirada y sin arrugas grandes. Si la colgás, que sea contra una pared lisa.</li>
                <li><strong className="font-medium text-ink">Sacala de frente y desde arriba,</strong> sin inclinar el celular, con la prenda centrada.</li>
                <li><strong className="font-medium text-ink">Luz natural y pareja,</strong> sin sombras fuertes ni flash. Cerca de una ventana funciona muy bien.</li>
                <li><strong className="font-medium text-ink">Sin personas ni objetos</strong> alrededor (zapatos, bolsos, mascotas). El calzado, de a un par.</li>
              </ul>
              <p className="mt-2 text-xs text-graphite">Con estas fotos el reconocimiento y el "Fondo limpio" funcionan mucho mejor. Siempre podés corregir la ficha a mano.</p>
            </details>
            {!editing && photoCount === 0 && (
              <p className="mt-2 text-xs leading-relaxed text-graphite">Sumá una foto y reconocemos la prenda por vos. También podés cargarla sin foto y agregarla después.</p>
            )}
          </section>

          {analysis.state !== "idle" && (
            <div role="status" className={cx("flex items-start gap-3 rounded-xl px-4 py-3 text-[13px] leading-relaxed", analysis.state === "ai" || analysis.state === "local" ? "bg-ink text-white" : "bg-mist")}>
              {analyzing ? <Spinner className="mt-0.5 h-4 w-4 shrink-0" /> : <Sparkles className={cx("mt-0.5 h-4 w-4 shrink-0", analysis.state === "ai" || analysis.state === "local" ? "text-white" : "text-crimson")} />}
              <span>
                {analysis.state === "running" && (analysis.progress !== undefined && analysis.progress < 100
                  ? `Preparando el reconocimiento de prendas (${analysis.progress} %). Solo la primera vez.`
                  : "Analizando la foto…")}
                {analysis.state === "local" && "Reconocimos la prenda en tu dispositivo y completamos la ficha. Es una sugerencia: revisala y corregí lo que haga falta."}
                {analysis.state === "ai" && "Reconocimos la prenda con IA y completamos su ficha. Revisala y corregí lo que haga falta."}
                {analysis.state === "colors" && "Detectamos los colores de la foto. Completá el tipo de prenda y el resto de la ficha."}
                {analysis.state === "not-garment" && "No pudimos reconocer una prenda en la foto. Completá la ficha a mano o probá con otra imagen."}
              </span>
            </div>
          )}

          <fieldset disabled={analyzing} className={cx("space-y-5 transition-opacity", analyzing && "opacity-50")}>
            <Field label="Nombre" hint="Opcional">
              <input className="field" value={attrs.name} maxLength={80} placeholder={`${capitalize(attrs.type)} ${attrs.primary_color}`} onChange={(e) => set("name", e.target.value)} />
            </Field>

            <div>
              <p className="mb-2 text-[13px] font-medium">Categoría</p>
              <div className="flex flex-wrap gap-2">
                {CATEGORIES.map((c) => <Chip key={c} selected={attrs.category === c} onClick={() => changeCategory(c)}>{CATEGORY_LABELS[c]}</Chip>)}
              </div>
            </div>

            <div>
              <p className="mb-2 text-[13px] font-medium">Tipo de prenda</p>
              <div className="flex flex-wrap gap-2">
                {TYPES_BY_CATEGORY[attrs.category].map((t) => <Chip key={t} size="sm" selected={attrs.type === t} onClick={() => changeType(t)}>{capitalize(t)}</Chip>)}
              </div>
            </div>

            <div>
              <p className="mb-2 flex items-baseline justify-between text-[13px] font-medium">Color predominante <span className="text-xs font-normal text-graphite">{capitalize(attrs.primary_color)}</span></p>
              <ColorPicker options={COLOR_NAMES} value={[attrs.primary_color]} onChange={([c]) => set("primary_color", c)} />
            </div>

            <div>
              <p className="mb-2 flex items-baseline justify-between text-[13px] font-medium">Colores secundarios <span className="text-xs font-normal text-graphite">Hasta 3</span></p>
              <ColorPicker options={COLOR_NAMES.filter((c) => c !== attrs.primary_color)} value={attrs.secondary_colors} onChange={(v) => set("secondary_colors", v)} multiple max={3} />
            </div>

            <div>
              <p className="mb-2 text-[13px] font-medium">Estampado</p>
              <div className="flex flex-wrap gap-2">
                {PATTERNS.map((p) => <Chip key={p} size="sm" selected={attrs.pattern === p} onClick={() => set("pattern", p)}>{capitalize(p)}</Chip>)}
              </div>
            </div>

            <div>
              <p className="mb-2 flex items-baseline justify-between text-[13px] font-medium">Estilo <span className="text-xs font-normal text-graphite">Hasta 3</span></p>
              <ChipGroup options={STYLES} value={attrs.styles as (typeof STYLES)[number][]} onChange={(v) => set("styles", v)} max={3} />
            </div>

            <div>
              <p className="mb-2 text-[13px] font-medium">Temporada</p>
              <ChipGroup options={SEASONS} value={attrs.seasons as (typeof SEASONS)[number][]} onChange={(v) => set("seasons", v)} />
            </div>

            <div className="grid gap-5 sm:grid-cols-2">
              <LevelField label="Abrigo" value={attrs.warmth} labels={WARMTH_LABELS} onChange={(n) => { setLevelsTouched(true); set("warmth", n); }} />
              <LevelField label="Formalidad" value={attrs.formality} labels={FORMALITY_LABELS} onChange={(n) => { setLevelsTouched(true); set("formality", n); }} />
            </div>

            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Material" hint="Opcional">
                <select className="field" value={attrs.material ?? ""} onChange={(e) => set("material", e.target.value || null)}>
                  <option value="">Sin especificar</option>
                  {MATERIALS.map((m) => <option key={m} value={m}>{capitalize(m)}</option>)}
                </select>
              </Field>
              {attrs.category !== "shoes" && attrs.category !== "accessory" && (
                <Field label="Calce">
                  <Segmented ariaLabel="Calce" value={attrs.fit ?? "regular"} onChange={(v) => set("fit", v as Fit)} options={FITS.map((f) => ({ value: f, label: capitalize(f) }))} />
                </Field>
              )}
            </div>

            <label className="flex cursor-pointer items-center justify-between gap-4 rounded-xl border border-black/10 px-4 py-3">
              <span>
                <span className="block text-[13px] font-medium">Apta para lluvia</span>
                <span className="block text-xs text-graphite">Impermeable o resistente al agua</span>
              </span>
              <input type="checkbox" className="peer sr-only" checked={attrs.waterproof} onChange={(e) => set("waterproof", e.target.checked)} />
              <span className="relative h-6 w-11 shrink-0 rounded-full bg-black/15 transition-colors after:absolute after:left-0.5 after:top-0.5 after:h-5 after:w-5 after:rounded-full after:bg-paper after:shadow after:transition-transform peer-checked:bg-crimson peer-checked:after:translate-x-5 peer-focus-visible:ring-2 peer-focus-visible:ring-crimson/60 peer-focus-visible:ring-offset-2" />
            </label>

            <Field label="Notas" hint="Opcional">
              <textarea className="field min-h-20 resize-none" maxLength={300} value={attrs.notes ?? ""} placeholder="Ej.: queda mejor con tiro alto" onChange={(e) => set("notes", e.target.value)} />
            </Field>
          </fieldset>
        </div>
      </Sheet>
      <LimitSheet kind="garments" open={limitOpen} onClose={() => setLimitOpen(false)} />
    </>
  );
}
