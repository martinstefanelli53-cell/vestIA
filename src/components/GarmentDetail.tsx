import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Droplets, Heart, Pencil, Sparkles, Trash2 } from "lucide-react";
import { CATEGORY_LABELS } from "@shared/taxonomy.ts";
import { capitalize, shortDate } from "@/lib/format";
import { FORMALITY_LABELS, WARMTH_LABELS } from "@/lib/garmentDefaults";
import type { Garment } from "@/lib/types";
import { friendlyError, signedImageUrl, useDeleteGarment, useToggleFavorite } from "@/hooks/data";
import { GarmentThumb } from "./Garment";
import { useToast } from "./Toast";
import { Button, ColorDot, ConfirmDialog, cx, IconButton, Sheet } from "./ui";

function Meter({ label, value, caption }: { label: string; value: number; caption: string }) {
  return (
    <div className="rounded-xl bg-mist px-3.5 py-3">
      <p className="text-[11px] text-graphite">{label}</p>
      <div className="mt-1.5 flex gap-1" aria-label={`${label}: ${value} de 5`}>
        {[1, 2, 3, 4, 5].map((n) => <span key={n} className={cx("h-1.5 flex-1 rounded-full", n <= value ? "bg-ink" : "bg-black/12")} />)}
      </div>
      <p className="mt-1.5 text-xs font-medium">{caption}</p>
    </div>
  );
}

interface Props {
  garment: Garment | null;
  onClose: () => void;
  onEdit: (garment: Garment) => void;
}

export function GarmentDetail({ garment, onClose, onEdit }: Props) {
  const navigate = useNavigate();
  const toast = useToast();
  const remove = useDeleteGarment();
  const favorite = useToggleFavorite();
  const [active, setActive] = useState(0);
  const [confirming, setConfirming] = useState(false);

  // Las fotos originales se piden recién al abrir la ficha.
  const { data: photos } = useQuery({
    queryKey: ["garment-photos", garment?.id, garment?.garment_images.map((i) => i.id).join()],
    enabled: Boolean(garment?.garment_images.length),
    staleTime: 30 * 60_000,
    queryFn: () => Promise.all(garment!.garment_images.map((img) => signedImageUrl(img.storage_path))),
  });

  if (!garment) return null;
  const index = Math.min(active, Math.max(0, garment.garment_images.length - 1));

  const confirmDelete = async () => {
    try {
      await remove.mutateAsync(garment);
      toast("Prenda eliminada");
      setConfirming(false);
      onClose();
    } catch (e) {
      toast(friendlyError(e), "error");
    }
  };

  const tags = [capitalize(garment.pattern), ...garment.styles.map(capitalize), garment.material && capitalize(garment.material), garment.fit && `Calce ${garment.fit}`].filter(Boolean) as string[];

  return (
    <>
      <Sheet
        open
        onClose={onClose}
        size="lg"
        title={garment.name}
        footer={
          <div className="flex items-center gap-2">
            <Button className="flex-1" icon={<Sparkles className="h-4 w-4" />} onClick={() => navigate(`/outfit?prenda=${garment.id}&auto=1`)}>Armar outfit con esta prenda</Button>
            <IconButton label="Editar prenda" onClick={() => onEdit(garment)} className="border border-black/12"><Pencil className="h-4 w-4" /></IconButton>
            <IconButton label="Eliminar prenda" onClick={() => setConfirming(true)} className="border border-black/12 hover:!bg-crimson-soft hover:text-crimson"><Trash2 className="h-4 w-4" /></IconButton>
          </div>
        }
      >
        <div className="grid gap-6 sm:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
          <div>
            <div className="relative">
              <GarmentThumb garment={garment} src={photos?.[index] ?? undefined} />
              <IconButton tone="light" label={garment.is_favorite ? "Quitar de favoritas" : "Marcar como favorita"} active={garment.is_favorite} onClick={() => favorite.mutate(garment)} className="absolute right-2.5 top-2.5">
                <Heart className="h-[18px] w-[18px]" fill={garment.is_favorite ? "currentColor" : "none"} />
              </IconButton>
            </div>
            {garment.garment_images.length > 1 && (
              <div className="mt-2 flex gap-2">
                {garment.garment_images.map((img, i) => (
                  <button key={img.id} type="button" aria-label={`Ver foto ${i + 1}`} onClick={() => setActive(i)}
                    className={cx("h-14 w-11 overflow-hidden rounded-lg bg-mist transition-all", i === index ? "ring-2 ring-ink ring-offset-2" : "opacity-60 hover:opacity-100")}>
                    {photos?.[i] && <img src={photos[i]!} alt="" className="h-full w-full object-cover" />}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-5">
            <div>
              <p className="eyebrow">{CATEGORY_LABELS[garment.category]} · {capitalize(garment.type)}</p>
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm">
                <span className="flex items-center gap-1.5 font-medium"><ColorDot color={garment.primary_color} /> {capitalize(garment.primary_color)}</span>
                {garment.secondary_colors.map((c) => <span key={c} className="flex items-center gap-1.5 text-graphite"><ColorDot color={c} size={12} /> {capitalize(c)}</span>)}
              </div>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {tags.map((tag) => <span key={tag} className="rounded-full border border-black/12 px-2.5 py-1 text-xs font-medium">{tag}</span>)}
              {garment.waterproof && <span className="flex items-center gap-1 rounded-full bg-ink px-2.5 py-1 text-xs font-medium text-white"><Droplets className="h-3 w-3" /> Apta lluvia</span>}
            </div>

            <div className="grid grid-cols-2 gap-2">
              <Meter label="Abrigo" value={garment.warmth} caption={WARMTH_LABELS[garment.warmth - 1]} />
              <Meter label="Formalidad" value={garment.formality} caption={FORMALITY_LABELS[garment.formality - 1]} />
            </div>

            <dl className="grid grid-cols-2 gap-2 text-sm">
              <div className="rounded-xl border border-black/[0.08] px-3.5 py-3">
                <dt className="text-[11px] text-graphite">Usos registrados</dt>
                <dd className="text-lg font-semibold">{garment.wear_count}</dd>
              </div>
              <div className="rounded-xl border border-black/[0.08] px-3.5 py-3">
                <dt className="text-[11px] text-graphite">Último uso</dt>
                <dd className="text-lg font-semibold">{garment.last_worn_on ? shortDate(garment.last_worn_on) : "Sin estrenar"}</dd>
              </div>
            </dl>

            <p className="text-xs text-graphite">
              {garment.seasons.length === 4 || garment.seasons.length === 0 ? "Para todo el año" : `Temporada: ${garment.seasons.join(", ")}`}
              {garment.ai_classified && " · Clasificada con IA"}
            </p>
            {garment.notes && <p className="rounded-xl bg-mist px-3.5 py-3 text-sm leading-relaxed">{garment.notes}</p>}
          </div>
        </div>
      </Sheet>
      <ConfirmDialog
        open={confirming}
        title="Eliminar prenda"
        text={`Vas a eliminar "${garment.name}" y sus fotos. También se quita de los outfits donde aparece. Esta acción no se puede deshacer.`}
        confirmLabel="Eliminar"
        loading={remove.isPending}
        onConfirm={confirmDelete}
        onClose={() => setConfirming(false)}
      />
    </>
  );
}
