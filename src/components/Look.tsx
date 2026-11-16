// Tarjetas editoriales del feed. En la etapa 1 no hay fotografías: se usa un
// placeholder neutro con la paleta del look. Cuando `image_path` tenga valor,
// se muestra la foto real del bucket público `inspiration`.
import { useNavigate } from "react-router-dom";
import { Bookmark, Sparkles } from "lucide-react";
import { CATEGORY_LABELS, OCCASIONS } from "@shared/taxonomy.ts";
import { KIND_LABELS, relatedLooks } from "@/lib/feed";
import { capitalize, joinList } from "@/lib/format";
import { SUPABASE_URL } from "@/lib/supabase";
import type { Look } from "@/lib/types";
import { colorHex } from "@/styling/colors";
import { Button, ColorDot, cx, Sheet } from "./ui";

export function LookVisual({ look, className }: { look: Look; className?: string }) {
  if (look.image_path) {
    return (
      <div className={cx("overflow-hidden rounded-card bg-mist", className)}>
        <img src={`${SUPABASE_URL}/storage/v1/object/public/inspiration/${look.image_path}`} alt={look.title} loading="lazy" className="h-full w-full object-cover" />
      </div>
    );
  }
  return (
    <div className={cx("relative flex items-end justify-center overflow-hidden rounded-card bg-mist", className)} role="img" aria-label={`Paleta: ${joinList(look.palette)}`}>
      <div className="flex h-[62%] w-[70%] items-end justify-center gap-[6%]">
        {look.palette.slice(0, 3).map((color, i) => (
          <span key={color} className="w-full rounded-t-full shadow-[0_10px_30px_-12px_rgba(0,0,0,0.35)] ring-1 ring-black/[0.06]"
            style={{ backgroundColor: colorHex(color), height: `${[100, 78, 58][i]}%` }} />
        ))}
      </div>
    </div>
  );
}

interface CardProps {
  look: Look;
  saved: boolean;
  forYou?: boolean;
  onOpen: () => void;
  onToggleSave: () => void;
}

export function LookCard({ look, saved, forYou, onOpen, onToggleSave }: CardProps) {
  return (
    <article className="group relative animate-fade-up">
      <button type="button" onClick={onOpen} className="block w-full text-left transition-transform duration-200 active:scale-[0.98]">
        <div className="relative">
          <LookVisual look={look} className="aspect-[4/5] transition-shadow duration-200 group-hover:shadow-card" />
          <span className="absolute left-3 top-3 rounded-full bg-paper/90 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-label backdrop-blur">{KIND_LABELS[look.kind]}</span>
          {forYou && <span className="absolute bottom-3 left-3 rounded-full bg-crimson px-2.5 py-1 text-[10px] font-semibold uppercase tracking-label text-white">Para vos</span>}
        </div>
        <p className="eyebrow mt-3 !text-[10px]">{capitalize(look.style)}{look.season ? ` · ${look.season}` : ""}</p>
        <h3 className="mt-0.5 text-[15px] font-semibold leading-snug">{look.title}</h3>
      </button>
      <button type="button" onClick={onToggleSave} aria-pressed={saved} aria-label={saved ? "Quitar de guardados" : "Guardar look"}
        className={cx("absolute right-2.5 top-2.5 flex h-9 w-9 items-center justify-center rounded-full bg-paper/90 shadow-card backdrop-blur transition-all duration-150 active:scale-90", saved ? "text-crimson" : "text-ink/60 hover:text-ink")}>
        <Bookmark className="h-4 w-4" fill={saved ? "currentColor" : "none"} />
      </button>
    </article>
  );
}

interface SheetProps {
  look: Look | null;
  all: Look[];
  saved: boolean;
  onClose: () => void;
  onToggleSave: () => void;
  onOpenLook: (look: Look) => void;
}

export function LookSheet({ look, all, saved, onClose, onToggleSave, onOpenLook }: SheetProps) {
  const navigate = useNavigate();
  if (!look) return null;
  const occasion = OCCASIONS.find((o) => o.id === look.occasion);
  const related = relatedLooks(look, all);
  const recreate = () => {
    const request = `Un look ${look.style} con ${joinList(look.palette.slice(0, 2))}`;
    navigate(`/outfit?auto=1${look.occasion ? `&ocasion=${look.occasion}` : ""}&pedido=${encodeURIComponent(request)}`);
  };

  return (
    <Sheet
      open
      onClose={onClose}
      size="lg"
      title={look.title}
      footer={
        <div className="flex gap-2">
          <Button className="flex-1" icon={<Sparkles className="h-4 w-4" />} onClick={recreate}>Recrear con mi guardarropa</Button>
          <Button variant={saved ? "dark" : "outline"} onClick={onToggleSave} icon={<Bookmark className="h-4 w-4" fill={saved ? "currentColor" : "none"} />}>{saved ? "Guardado" : "Guardar"}</Button>
        </div>
      }
    >
      <div className="grid gap-6 sm:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
        <LookVisual look={look} className="aspect-[4/5]" />
        <div className="space-y-5">
          <div>
            <p className="eyebrow">{KIND_LABELS[look.kind]} · {capitalize(look.style)}{occasion ? ` · ${occasion.label}` : ""}</p>
            <p className="mt-2.5 text-[15px] leading-relaxed">{look.description}</p>
          </div>
          <div>
            <h3 className="mb-2 text-[13px] font-semibold">Las piezas</h3>
            <ul className="divide-y divide-black/[0.06] rounded-xl border border-black/[0.08]">
              {look.pieces.map((piece, i) => (
                <li key={i} className="flex items-center gap-3 px-3.5 py-2.5 text-sm">
                  <ColorDot color={piece.color} />
                  <span className="font-medium">{capitalize(piece.type)} {piece.color}</span>
                  <span className="ml-auto text-xs text-graphite">{CATEGORY_LABELS[piece.category]}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {look.tags.map((tag) => <span key={tag} className="rounded-full bg-mist px-2.5 py-1 text-xs font-medium">#{tag}</span>)}
          </div>
        </div>
      </div>
      {related.length > 0 && (
        <div className="mt-7 border-t border-black/[0.06] pt-5">
          <h3 className="mb-3 text-[13px] font-semibold">También te puede interesar</h3>
          <div className="grid grid-cols-3 gap-3">
            {related.map((other) => (
              <button key={other.id} type="button" onClick={() => onOpenLook(other)} className="text-left transition-transform active:scale-[0.97]">
                <LookVisual look={other} className="aspect-[4/5]" />
                <p className="mt-1.5 truncate text-xs font-medium">{other.title}</p>
              </button>
            ))}
          </div>
        </div>
      )}
    </Sheet>
  );
}
