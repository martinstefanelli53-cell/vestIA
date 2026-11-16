// Representación visual de prendas. Cuando no hay fotografía se usa un
// placeholder neutro y consistente (ícono de categoría + color de la prenda).
import { Heart } from "lucide-react";
import { CATEGORY_LABELS, type Category } from "@shared/taxonomy.ts";
import type { Garment } from "@/lib/types";
import { capitalize } from "@/lib/format";
import { ColorDot, cx } from "./ui";

const ICON_PATHS: Record<Category, string> = {
  top: "M8.5 3 4 5 2 9.5l3 1.7 1-1V21h12V10.2l1 1 3-1.7L20 5l-4.5-2a3.6 3.6 0 0 1-7 0Z",
  bottom: "M6.5 3h11l1.5 18h-5.2L12 9.5 10.2 21H5L6.5 3Z",
  dress: "M9 3v3.2L7.2 9l1.9 2.2L5 21h14l-4.1-9.8L16.8 9 15 6.2V3M9 6.2c1 1 5 1 6 0",
  outerwear: "M9 3 4.5 5.5 3 21h5V10m0 11h8V10m0 11h5L19.5 5.5 15 3l-3 4.2L9 3Zm3 4.2V21",
  shoes: "M3 18v-6.5l3.5 1 4-4.5 3 5.5 6 1.8c1 .3 1.5 1.2 1.5 2.2V18H3Zm0-2.5h18",
  accessory: "M5 9h14l1.2 12H3.8L5 9Zm4 0V7a3 3 0 0 1 6 0v2",
};

export function CategoryIcon({ category, className }: { category: Category; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" strokeLinecap="round" className={className} aria-hidden>
      <path d={ICON_PATHS[category]} />
    </svg>
  );
}

interface ThumbProps {
  garment: Pick<Garment, "name" | "category" | "primary_color" | "thumbUrl">;
  className?: string;
  src?: string | null;
}

export function GarmentThumb({ garment, className, src }: ThumbProps) {
  const url = src ?? garment.thumbUrl;
  return (
    <div className={cx("relative aspect-[4/5] overflow-hidden rounded-card bg-mist", className)}>
      {url ? (
        <img src={url} alt={garment.name} loading="lazy" className="h-full w-full object-cover" />
      ) : (
        <div className="flex h-full w-full items-center justify-center" role="img" aria-label={`${garment.name} (sin foto)`}>
          <CategoryIcon category={garment.category} className="h-[38%] w-[38%] text-black/25" />
          <span className="absolute bottom-2.5 left-2.5"><ColorDot color={garment.primary_color} size={16} /></span>
        </div>
      )}
    </div>
  );
}

interface TileProps {
  garment: Garment;
  onOpen: () => void;
  onToggleFavorite?: () => void;
}

export function GarmentTile({ garment, onOpen, onToggleFavorite }: TileProps) {
  return (
    <div className="group relative animate-fade-up">
      <button type="button" onClick={onOpen} className="block w-full rounded-card text-left transition-transform duration-200 active:scale-[0.98]">
        <GarmentThumb garment={garment} className="transition-shadow duration-200 group-hover:shadow-card" />
        <div className="mt-2 px-0.5">
          <p className="truncate text-sm font-medium">{garment.name}</p>
          <p className="mt-0.5 flex items-center gap-1.5 text-xs text-graphite">
            <ColorDot color={garment.primary_color} size={10} />
            <span className="truncate">{capitalize(garment.type)} · {CATEGORY_LABELS[garment.category]}</span>
          </p>
        </div>
      </button>
      {onToggleFavorite && (
        <button
          type="button"
          onClick={onToggleFavorite}
          aria-label={garment.is_favorite ? "Quitar de favoritas" : "Marcar como favorita"}
          aria-pressed={garment.is_favorite}
          className={cx(
            "absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-paper/90 shadow-card backdrop-blur transition-all duration-150 active:scale-90",
            garment.is_favorite ? "text-crimson" : "text-ink/60 hover:text-ink",
          )}
        >
          <Heart className="h-4 w-4" fill={garment.is_favorite ? "currentColor" : "none"} />
        </button>
      )}
    </div>
  );
}
