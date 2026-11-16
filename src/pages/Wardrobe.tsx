import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Heart, Plus, Search, Shirt, X } from "lucide-react";
import { CATEGORIES, CATEGORY_LABELS, COLOR_NAMES, STYLES, type Category } from "@shared/taxonomy.ts";
import { GarmentTile } from "@/components/Garment";
import { GarmentDetail } from "@/components/GarmentDetail";
import { GarmentEditor } from "@/components/GarmentEditor";
import { LimitSheet } from "@/components/Plan";
import { Button, Chip, cx, EmptyState, PageHeader, Skeleton } from "@/components/ui";
import { useEntitlements, useGarments, useToggleFavorite } from "@/hooks/data";
import { capitalize } from "@/lib/format";
import type { Garment } from "@/lib/types";
import { normalize } from "@/styling/intent";

export function WardrobePage() {
  const { data: garments, isLoading } = useGarments();
  const { data: entitlements } = useEntitlements();
  const favorite = useToggleFavorite();
  const [params, setParams] = useSearchParams();

  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<Category | null>(null);
  const [color, setColor] = useState("");
  const [style, setStyle] = useState("");
  const [onlyFavorites, setOnlyFavorites] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [editor, setEditor] = useState<{ open: boolean; garment: Garment | null }>({ open: false, garment: null });
  const [limitOpen, setLimitOpen] = useState(false);

  const limit = entitlements?.plan.garment_limit;
  const total = garments?.length ?? 0;

  const openNew = () => {
    if (limit !== undefined && total >= limit) setLimitOpen(true);
    else setEditor({ open: true, garment: null });
  };

  // Acceso rápido desde Home: /guardarropa?nueva=1 abre el alta directamente.
  useEffect(() => {
    if (params.get("nueva") && garments && entitlements) {
      setParams({}, { replace: true });
      openNew();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params, garments, entitlements]);

  const filtered = useMemo(() => {
    const term = normalize(search.trim());
    return (garments ?? []).filter((g) => {
      if (category && g.category !== category) return false;
      if (color && g.primary_color !== color && !g.secondary_colors.includes(color)) return false;
      if (style && !g.styles.includes(style)) return false;
      if (onlyFavorites && !g.is_favorite) return false;
      if (term && !normalize(`${g.name} ${g.type} ${g.primary_color} ${g.pattern} ${g.styles.join(" ")} ${g.material ?? ""}`).includes(term)) return false;
      return true;
    });
  }, [garments, search, category, color, style, onlyFavorites]);

  const activeFilters = [category, color, style, onlyFavorites, search.trim()].filter(Boolean).length;
  const clearFilters = () => { setSearch(""); setCategory(null); setColor(""); setStyle(""); setOnlyFavorites(false); };
  const detail = garments?.find((g) => g.id === detailId) ?? null;
  const usedColors = COLOR_NAMES.filter((c) => garments?.some((g) => g.primary_color === c || g.secondary_colors.includes(c)));
  const usedStyles = STYLES.filter((s) => garments?.some((g) => g.styles.includes(s)));

  return (
    <>
      <PageHeader
        overline={limit !== undefined ? `${total} de ${limit} prendas` : "Tu guardarropa"}
        title="Guardarropa"
        action={<Button onClick={openNew} icon={<Plus className="h-4 w-4" />}>Agregar</Button>}
      />

      {isLoading && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="aspect-[4/5]" />)}
        </div>
      )}

      {!isLoading && total === 0 && (
        <EmptyState
          icon={<Shirt className="h-5 w-5" />}
          title="Tu guardarropa está vacío"
          text="Sacale una foto a tus prendas y VESTIA las reconoce y organiza. Con unas pocas ya podés generar tus primeros outfits."
          action={<Button onClick={openNew} icon={<Plus className="h-4 w-4" />}>Cargar mi primera prenda</Button>}
        />
      )}

      {!isLoading && total > 0 && (
        <>
          <div className="relative mb-3">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-graphite" />
            <input className="field !rounded-full pl-11 pr-10" placeholder="Buscar por nombre, tipo, color…" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Buscar prendas" />
            {search && (
              <button type="button" aria-label="Borrar búsqueda" onClick={() => setSearch("")} className="absolute right-3 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-graphite hover:bg-mist">
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          <div className="no-scrollbar -mx-4 mb-3 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0" role="group" aria-label="Filtrar por categoría">
            <Chip selected={!category} onClick={() => setCategory(null)}>Todas</Chip>
            {CATEGORIES.filter((c) => garments!.some((g) => g.category === c)).map((c) => (
              <Chip key={c} selected={category === c} onClick={() => setCategory(category === c ? null : c)}>{CATEGORY_LABELS[c]}</Chip>
            ))}
          </div>

          <div className="mb-6 flex flex-wrap items-center gap-2">
            <select aria-label="Filtrar por color" value={color} onChange={(e) => setColor(e.target.value)}
              className={cx("h-9 rounded-full border bg-paper px-3 !text-[13px] font-medium transition-colors", color ? "border-ink" : "border-black/12 hover:border-ink")}>
              <option value="">Color</option>
              {usedColors.map((c) => <option key={c} value={c}>{capitalize(c)}</option>)}
            </select>
            <select aria-label="Filtrar por estilo" value={style} onChange={(e) => setStyle(e.target.value)}
              className={cx("h-9 rounded-full border bg-paper px-3 !text-[13px] font-medium transition-colors", style ? "border-ink" : "border-black/12 hover:border-ink")}>
              <option value="">Estilo</option>
              {usedStyles.map((s) => <option key={s} value={s}>{capitalize(s)}</option>)}
            </select>
            <Chip selected={onlyFavorites} onClick={() => setOnlyFavorites(!onlyFavorites)}>
              <Heart className="h-3.5 w-3.5" fill={onlyFavorites ? "currentColor" : "none"} /> Favoritas
            </Chip>
            {activeFilters > 0 && (
              <button type="button" onClick={clearFilters} className="ml-auto text-[13px] font-medium text-crimson underline-offset-4 hover:underline">
                Limpiar filtros
              </button>
            )}
          </div>

          {filtered.length === 0 ? (
            <EmptyState title="Sin resultados" text="Ninguna prenda coincide con esos filtros." action={<Button variant="outline" onClick={clearFilters}>Limpiar filtros</Button>} />
          ) : (
            <>
              {activeFilters > 0 && <p className="mb-3 text-xs text-graphite">{filtered.length} {filtered.length === 1 ? "prenda" : "prendas"}</p>}
              <div className="grid grid-cols-2 gap-x-3 gap-y-6 sm:grid-cols-3 lg:grid-cols-4">
                {filtered.map((g) => (
                  <GarmentTile key={g.id} garment={g} onOpen={() => setDetailId(g.id)} onToggleFavorite={() => favorite.mutate(g)} />
                ))}
              </div>
            </>
          )}
        </>
      )}

      {detail && !editor.open && (
        <GarmentDetail garment={detail} onClose={() => setDetailId(null)} onEdit={(g) => setEditor({ open: true, garment: g })} />
      )}
      <GarmentEditor open={editor.open} garment={editor.garment} onClose={() => setEditor({ open: false, garment: null })} />
      <LimitSheet kind="garments" open={limitOpen} onClose={() => setLimitOpen(false)} />
    </>
  );
}
