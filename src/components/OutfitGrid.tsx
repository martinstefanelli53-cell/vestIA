import { RefreshCw } from "lucide-react";
import { CATEGORY_LABELS } from "@shared/taxonomy.ts";
import type { Garment } from "@/lib/types";
import { GarmentThumb } from "./Garment";
import { cx } from "./ui";

interface Props {
  items: Garment[];
  onReplace?: (garment: Garment) => void;
  onOpen?: (garment: Garment) => void;
  busy?: boolean;
}

/** Vista principal de un outfit: una tarjeta por prenda, con opción de reemplazo individual. */
export function OutfitGrid({ items, onReplace, onOpen, busy }: Props) {
  return (
    <ul className={cx("grid gap-3", items.length <= 3 ? "grid-cols-3" : "grid-cols-2 sm:grid-cols-3 lg:grid-cols-5")}>
      {items.map((garment) => (
        <li key={garment.id} className="relative animate-fade-up">
          <button type="button" onClick={() => onOpen?.(garment)} disabled={!onOpen} className="block w-full text-left">
            <GarmentThumb garment={garment} />
            <p className="eyebrow mt-2 !text-[10px]">{CATEGORY_LABELS[garment.category]}</p>
            <p className="truncate text-sm font-medium">{garment.name}</p>
          </button>
          {onReplace && (
            <button
              type="button"
              onClick={() => onReplace(garment)}
              disabled={busy}
              aria-label={`Cambiar ${garment.name} por otra prenda`}
              title="Cambiar solo esta prenda"
              className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-paper/90 text-ink shadow-card backdrop-blur transition-all duration-150 hover:bg-paper active:scale-90 active:rotate-45 disabled:opacity-40"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}

/** Tira compacta de miniaturas para listados e historial. */
export function OutfitStrip({ items, size = "md" }: { items: Garment[]; size?: "sm" | "md" }) {
  return (
    <div className="flex gap-1.5">
      {items.slice(0, 5).map((garment) => (
        <GarmentThumb key={garment.id} garment={garment} className={cx("shrink-0 !rounded-lg", size === "sm" ? "w-11" : "w-16")} />
      ))}
    </div>
  );
}
