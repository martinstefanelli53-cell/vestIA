import { useMemo, useState } from "react";
import { Bookmark, Compass } from "lucide-react";
import { OCCASIONS, STYLES } from "@shared/taxonomy.ts";
import { LookCard, LookSheet } from "@/components/Look";
import { Chip, cx, EmptyState, PageHeader, Skeleton } from "@/components/ui";
import { useLooks, useProfile, useToggleLookSave } from "@/hooks/data";
import { KIND_LABELS, rankLooks } from "@/lib/feed";
import { capitalize, currentSeason } from "@/lib/format";
import type { Look } from "@/lib/types";

type KindFilter = "todos" | Look["kind"] | "guardados";

export function FeedPage() {
  const { data, isLoading, isError, refetch } = useLooks();
  const { data: profile } = useProfile();
  const toggleSave = useToggleLookSave();
  const [kind, setKind] = useState<KindFilter>("todos");
  const [style, setStyle] = useState("");
  const [occasion, setOccasion] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  const season = currentSeason(profile?.location_lat);
  const ranked = useMemo(() => rankLooks(data?.looks ?? [], profile, season), [data, profile, season]);
  const saved = new Set(data?.savedIds ?? []);
  const visible = ranked.filter((look) =>
    (kind === "todos" || (kind === "guardados" ? saved.has(look.id) : look.kind === kind)) &&
    (!style || look.style === style) && (!occasion || look.occasion === occasion));
  const open = ranked.find((l) => l.id === openId) ?? null;
  const styles = STYLES.filter((s) => ranked.some((l) => l.style === s));
  const occasions = OCCASIONS.filter((o) => ranked.some((l) => l.occasion === o.id));
  const personalized = Boolean(profile && (profile.styles.length || profile.favorite_colors.length || profile.occasions.length));
  const selectClass = (active: boolean) => cx("h-9 rounded-full border bg-paper px-3 !text-[13px] font-medium transition-colors", active ? "border-ink" : "border-black/12 hover:border-ink");

  return (
    <>
      <PageHeader overline={`Temporada de ${season}`} title="Inspiración" />
      <p className="-mt-3 mb-6 max-w-xl text-sm leading-relaxed text-graphite">
        Looks, combinaciones y tendencias para darle otra vuelta a lo que ya tenés.
        {personalized ? " Ordenados según tu estilo." : " Completá tu perfil para ver primero lo que va con vos."}
      </p>

      <div className="no-scrollbar -mx-4 mb-3 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0" role="group" aria-label="Explorar por categoría">
        <Chip selected={kind === "todos"} onClick={() => setKind("todos")}>Todo</Chip>
        {(Object.keys(KIND_LABELS) as Look["kind"][]).map((k) => (
          <Chip key={k} selected={kind === k} onClick={() => setKind(k)}>{k === "look" ? "Looks" : k === "combinacion" ? "Combinaciones" : "Tendencias"}</Chip>
        ))}
        <Chip selected={kind === "guardados"} onClick={() => setKind("guardados")}><Bookmark className="h-3.5 w-3.5" fill={kind === "guardados" ? "currentColor" : "none"} /> Guardados</Chip>
      </div>
      <div className="mb-6 flex flex-wrap items-center gap-2">
        <select aria-label="Filtrar por estilo" className={selectClass(Boolean(style))} value={style} onChange={(e) => setStyle(e.target.value)}>
          <option value="">Estilo</option>
          {styles.map((s) => <option key={s} value={s}>{capitalize(s)}</option>)}
        </select>
        <select aria-label="Filtrar por ocasión" className={selectClass(Boolean(occasion))} value={occasion} onChange={(e) => setOccasion(e.target.value)}>
          <option value="">Ocasión</option>
          {occasions.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
        </select>
        {(style || occasion) && (
          <button type="button" onClick={() => { setStyle(""); setOccasion(""); }} className="ml-auto text-[13px] font-medium text-crimson underline-offset-4 hover:underline">Limpiar filtros</button>
        )}
      </div>

      {isLoading && <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="aspect-[4/5]" />)}</div>}
      {isError && <EmptyState title="No pudimos cargar la inspiración" text="Revisá tu conexión e intentá de nuevo." action={<button type="button" className="text-sm font-medium text-crimson underline" onClick={() => refetch()}>Reintentar</button>} />}
      {!isLoading && !isError && visible.length === 0 && (
        <EmptyState
          icon={kind === "guardados" ? <Bookmark className="h-5 w-5" /> : <Compass className="h-5 w-5" />}
          title={kind === "guardados" ? "Todavía no guardaste looks" : "Sin resultados"}
          text={kind === "guardados" ? "Tocá el marcador de cualquier look para tenerlo a mano acá." : "No hay contenido con esa combinación de filtros."}
        />
      )}

      <div className="grid grid-cols-2 gap-x-4 gap-y-7 sm:grid-cols-3">
        {visible.map((look) => (
          <LookCard key={look.id} look={look} saved={saved.has(look.id)} forYou={personalized && look.affinity >= 5}
            onOpen={() => setOpenId(look.id)} onToggleSave={() => toggleSave.mutate({ lookId: look.id, saved: saved.has(look.id) })} />
        ))}
      </div>

      <LookSheet look={open} all={ranked} saved={open ? saved.has(open.id) : false} onClose={() => setOpenId(null)}
        onToggleSave={() => open && toggleSave.mutate({ lookId: open.id, saved: saved.has(open.id) })} onOpenLook={(l) => setOpenId(l.id)} />
    </>
  );
}
