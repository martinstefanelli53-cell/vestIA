// Ficha de una referencia de inspiración: foto, prendas detectadas (editables) y
// versiones armadas con el guardarropa de la persona.
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Bookmark, Check, Gift, Plus, RefreshCw, Sparkles, Trash2, X } from "lucide-react";
import { CATEGORIES, CATEGORY_LABELS, COLOR_NAMES, PATTERNS, TYPES_BY_CATEGORY, type Category } from "@shared/taxonomy.ts";
import { capitalize } from "@/lib/format";
import type { InspirationPiece } from "@/lib/inspirationVision";
import type { WishlistItem } from "@/hooks/data";
import type { Garment } from "@/lib/types";
import { buildVersions, MATCH_THRESHOLD, pieceLabel } from "@/styling/inspiration";
import { OutfitGrid } from "./OutfitGrid";
import { LimitSheet } from "./Plan";
import { useToast } from "./Toast";
import { Button, ColorDot, ConfirmDialog, Sheet, Spinner } from "./ui";

export interface InspirationDraft {
  id?: string; // presente si ya está guardada
  imageUrl: string | null;
  title: string;
  pieces: InspirationPiece[];
}

export type InspirationStatus = { state: "idle" } | { state: "detecting"; progress?: number } | { state: "error"; message: string };

interface Props {
  draft: InspirationDraft | null;
  status: InspirationStatus;
  garments: Garment[];
  saving: boolean;
  dirty: boolean;
  onChange: (draft: InspirationDraft) => void;
  onSave: () => void;
  onDelete?: () => void;
  onClose: () => void;
  /** Puntaje opcional del motor de estilismo (clima, preferencias) para ordenar versiones. */
  scoreItems?: (items: Garment[]) => number;
  onSaveOutfit: (items: Garment[], explanation: string) => Promise<void>;
  limitOpen: boolean;
  onLimitClose: () => void;
  wishlist: WishlistItem[];
  onAddToWishlist: (pieces: InspirationPiece[]) => Promise<void>;
}

const selectClass = "h-9 min-w-0 rounded-lg border border-black/12 bg-paper px-2 !text-[13px] focus:border-ink focus:outline-none";

function PieceRow({ piece, onChange, onRemove }: { piece: InspirationPiece; onChange: (p: InspirationPiece) => void; onRemove: () => void }) {
  return (
    <li className="flex items-center gap-2 rounded-xl border border-black/[0.08] px-3 py-2.5">
      <div className="min-w-0 flex-1">
        <p className="eyebrow !text-[10px]">{CATEGORY_LABELS[piece.category]}</p>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <select aria-label={`Tipo de ${CATEGORY_LABELS[piece.category]}`} className={selectClass} value={piece.type} onChange={(e) => onChange({ ...piece, type: e.target.value })}>
            {TYPES_BY_CATEGORY[piece.category].map((t) => <option key={t} value={t}>{capitalize(t)}</option>)}
          </select>
          <ColorDot color={piece.color} size={16} />
          <select aria-label="Color" className={selectClass} value={piece.color} onChange={(e) => onChange({ ...piece, color: e.target.value })}>
            {COLOR_NAMES.map((c) => <option key={c} value={c}>{capitalize(c)}</option>)}
          </select>
          <select aria-label="Estampado" className={selectClass} value={piece.pattern} onChange={(e) => onChange({ ...piece, pattern: e.target.value })}>
            {PATTERNS.map((p) => <option key={p} value={p}>{p === "liso" ? "Liso (sin estampado)" : capitalize(p)}</option>)}
          </select>
        </div>
      </div>
      <button type="button" aria-label={`Quitar ${pieceLabel(piece)}`} onClick={onRemove} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-graphite transition-colors hover:bg-mist hover:text-ink">
        <X className="h-4 w-4" />
      </button>
    </li>
  );
}

export function InspirationSheet({ draft, status, garments, saving, dirty, onChange, onSave, onDelete, onClose, scoreItems, onSaveOutfit, limitOpen, onLimitClose, wishlist, onAddToWishlist }: Props) {
  const toast = useToast();
  const [versionIndex, setVersionIndex] = useState<number | null>(null);
  const [savingOutfit, setSavingOutfit] = useState(false);
  const [savedOutfit, setSavedOutfit] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [addingWish, setAddingWish] = useState(false);

  const pieces = draft?.pieces ?? [];
  const versions = useMemo(() => (versionIndex === null ? [] : buildVersions(pieces, garments, scoreItems)), [versionIndex === null, pieces, garments, scoreItems]);
  const version = versionIndex === null ? null : versions[versionIndex % Math.max(1, versions.length)] ?? null;

  // Si se editan las prendas detectadas, el resultado anterior deja de valer.
  useEffect(() => { setVersionIndex(null); setSavedOutfit(false); }, [draft?.pieces]);
  useEffect(() => { if (!draft) { setVersionIndex(null); setSavedOutfit(false); } }, [draft]);

  if (!draft) return null;
  const detecting = status.state === "detecting";
  const setPieces = (next: InspirationPiece[]) => onChange({ ...draft, pieces: next });

  const addPiece = (category: Category) => {
    const type = TYPES_BY_CATEGORY[category][0];
    setPieces([...pieces, { category, type, color: "negro", secondary: [], pattern: "liso" }]);
  };

  const explanation = version
    ? `Versión armada a partir de una referencia de inspiración: ${version.matches.filter((m) => m.garment).map((m) => `${m.piece.type} ${m.piece.color} → ${m.garment!.name}`).join(", ")}.`
    : "";

  const saveOutfit = async () => {
    if (!version?.complete) return;
    setSavingOutfit(true);
    try {
      await onSaveOutfit(version.items, explanation);
      setSavedOutfit(true);
      toast("Outfit guardado en Mis outfits");
    } catch {
      /* el error (incluido el límite del plan) lo muestra el padre */
    } finally {
      setSavingOutfit(false);
    }
  };

  const pct = (n: number) => `${Math.round(n * 100)} %`;

  // Lo que falta (o solo se cubre de forma aproximada) puede ir a la lista de deseos.
  const wishKey = (p: Pick<InspirationPiece, "category" | "type" | "color" | "pattern">) => `${p.category}|${p.type}|${p.color}|${p.pattern}`;
  const inList = new Set(wishlist.filter((w) => w.inspiration_id === draft.id && draft.id).map(wishKey));
  const lacking = version ? version.matches.filter((m) => !m.garment || m.approx).map((m) => m.piece) : [];
  const toAdd = lacking.filter((p) => !inList.has(wishKey(p)));
  const addToWishlist = async () => {
    setAddingWish(true);
    try {
      await onAddToWishlist(toAdd);
      toast(toAdd.length === 1 ? "Agregada a tu lista de deseos" : `${toAdd.length} prendas agregadas a tu lista de deseos`);
    } catch {
      /* el error lo muestra el padre */
    } finally {
      setAddingWish(false);
    }
  };

  return (
    <>
      <Sheet
        open
        onClose={onClose}
        size="lg"
        title={draft.id ? "Tu referencia" : "Nueva referencia"}
        footer={
          <div className="flex flex-wrap items-center gap-2">
            <Button className="min-w-0 flex-1 basis-full sm:basis-0" icon={<Sparkles className="h-4 w-4" />} disabled={detecting || pieces.length === 0 || garments.length === 0}
              onClick={() => { setVersionIndex(0); setSavedOutfit(false); }}>
              Armar con mi guardarropa
            </Button>
            {(!draft.id || dirty) && (
              <Button variant="outline" icon={<Bookmark className="h-4 w-4" />} loading={saving} disabled={detecting || pieces.length === 0} onClick={onSave}>
                {draft.id ? "Guardar cambios" : "Guardar referencia"}
              </Button>
            )}
            {draft.id && onDelete && (
              <button type="button" aria-label="Eliminar referencia" onClick={() => setConfirming(true)} className="flex h-11 w-11 items-center justify-center rounded-full border border-black/12 transition-colors hover:bg-crimson-soft hover:text-crimson">
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </div>
        }
      >
        <div className="grid gap-6 sm:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
          <div>
            <div className="h-[44vh] overflow-hidden rounded-card bg-mist sm:aspect-[4/5] sm:h-auto">
              {draft.imageUrl && <img src={draft.imageUrl} alt="Foto de referencia" className="h-full w-full object-contain" />}
            </div>
            <input
              aria-label="Nombre de la referencia"
              className="field mt-3"
              placeholder="Ponele un nombre (opcional)"
              maxLength={60}
              value={draft.title}
              onChange={(e) => onChange({ ...draft, title: e.target.value })}
            />
          </div>

          <div className="space-y-4">
            <div>
              <p className="eyebrow">Prendas detectadas</p>
              {detecting && (
                <div role="status" className="mt-2 flex items-center gap-3 rounded-xl bg-mist px-4 py-3 text-[13px]">
                  <Spinner className="h-4 w-4 shrink-0" />
                  {status.progress !== undefined && status.progress < 100 ? `Preparando el reconocimiento (${status.progress} %). Solo la primera vez.` : "Detectando las prendas de la foto…"}
                </div>
              )}
              {status.state === "error" && (
                <p role="alert" className="mt-2 flex items-start gap-2 rounded-xl bg-crimson-soft px-4 py-3 text-[13px] leading-relaxed text-crimson">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {status.message}
                </p>
              )}
              {!detecting && pieces.length > 0 && <p className="mt-1 text-xs leading-relaxed text-graphite">Revisalas: si algo está mal detectado, corregilo antes de armar tu versión.</p>}
              <ul className="mt-2 space-y-2">
                {pieces.map((piece, i) => (
                  <PieceRow key={`${piece.category}-${i}`} piece={piece} onChange={(p) => setPieces(pieces.map((x, j) => (j === i ? p : x)))} onRemove={() => setPieces(pieces.filter((_, j) => j !== i))} />
                ))}
              </ul>
              {!detecting && (
                <label className="mt-2 flex items-center gap-2 text-[13px] text-graphite">
                  <Plus className="h-4 w-4" />
                  <select aria-label="Agregar una prenda" className={selectClass} value="" onChange={(e) => { if (e.target.value) addPiece(e.target.value as Category); }}>
                    <option value="">Agregar prenda que falte…</option>
                    {CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
                  </select>
                </label>
              )}
            </div>
            {garments.length === 0 && (
              <p className="rounded-xl bg-mist px-4 py-3 text-[13px] leading-relaxed">Cargá algunas prendas en tu guardarropa para poder armar tu versión de este look.</p>
            )}
          </div>
        </div>

        {version && (
          <section className="mt-8 border-t border-black/[0.08] pt-6 animate-fade-up" aria-live="polite">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="eyebrow">Tu versión</p>
                <h3 className="text-lg font-semibold">Con lo que tenés en tu guardarropa</h3>
              </div>
              {versions.length > 1 && (
                <Button variant="outline" size="sm" icon={<RefreshCw className="h-3.5 w-3.5" />} onClick={() => setVersionIndex((i) => ((i ?? 0) + 1) % versions.length)}>
                  Otra versión · {(versionIndex! % versions.length) + 1}/{versions.length}
                </Button>
              )}
            </div>

            {version.items.length > 0 ? (
              <div className="mt-4"><OutfitGrid items={version.items} /></div>
            ) : (
              <p className="mt-4 rounded-xl bg-mist px-4 py-3 text-sm">No encontramos prendas parecidas en tu guardarropa.</p>
            )}

            <ul className="mt-4 space-y-1.5 text-[13px]">
              {version.matches.map((m, i) => (
                <li key={i} className="flex items-start gap-2">
                  {m.garment ? <Check className="mt-0.5 h-4 w-4 shrink-0 text-ink" /> : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-crimson" />}
                  <span className="leading-relaxed">
                    <span className="font-medium">{capitalize(pieceLabel(m.piece))}</span>
                    {m.garment
                      ? <> → {m.garment.name} <span className="text-graphite">({m.approx ? `aproximada: no tenés algo más parecido, ${pct(m.score)}` : `${pct(m.score)} parecida`})</span></>
                      : <> → no tenés algo parecido{m.closest && m.closest.id ? <span className="text-graphite">. Lo más cercano: {m.closest.name}</span> : null}.</>}
                  </span>
                </li>
              ))}
            </ul>

            {lacking.length > 0 && (
              <div className="mt-4 rounded-xl border border-black/[0.08] px-4 py-3">
                <p className="text-sm font-medium">Te falta para este look</p>
                <ul className="mt-1.5 space-y-1 text-[13px] text-graphite">
                  {lacking.map((p, i) => (
                    <li key={i} className="flex items-center gap-2">
                      <ColorDot color={p.color} size={12} /> {capitalize(pieceLabel(p))}
                      {inList.has(wishKey(p)) && <span className="ml-auto flex items-center gap-1 text-xs text-ink"><Check className="h-3.5 w-3.5" /> En tu lista</span>}
                    </li>
                  ))}
                </ul>
                <Button className="mt-3" size="sm" variant="outline" icon={<Gift className="h-3.5 w-3.5" />} loading={addingWish} disabled={toAdd.length === 0} onClick={addToWishlist}>
                  {toAdd.length === 0 ? "Ya está en tu lista de deseos" : toAdd.length === 1 ? "Agregar a mi lista de deseos" : "Agregar todo a mi lista de deseos"}
                </Button>
              </div>
            )}

            {!version.complete && (
              <p className="mt-3 rounded-xl bg-mist px-4 py-3 text-[13px] leading-relaxed">
                Con lo que tenés no alcanza para un outfit completo (hace falta una parte superior y una inferior, o un vestido). Sumá esa prenda a tu guardarropa para completarlo.
              </p>
            )}
            {version.complete && version.missing.length > 0 && (
              <p className="mt-3 text-xs leading-relaxed text-graphite">
                Es una versión sin {version.missing.map(pieceLabel).join(", ")} (umbral de parecido: {pct(MATCH_THRESHOLD)}). El outfit igual está completo.
              </p>
            )}

            <div className="mt-4 flex flex-wrap gap-2">
              <Button icon={savedOutfit ? <Check className="h-4 w-4" /> : <Bookmark className="h-4 w-4" />} disabled={!version.complete || savedOutfit} loading={savingOutfit} onClick={saveOutfit}>
                {savedOutfit ? "Guardado" : "Guardar como outfit"}
              </Button>
            </div>
          </section>
        )}
      </Sheet>
      <ConfirmDialog
        open={confirming}
        title="Eliminar referencia"
        text="Vas a eliminar esta referencia y su foto. Esta acción no se puede deshacer."
        confirmLabel="Eliminar"
        onConfirm={() => { setConfirming(false); onDelete?.(); }}
        onClose={() => setConfirming(false)}
      />
      <LimitSheet kind="outfits" open={limitOpen} onClose={onLimitClose} />
    </>
  );
}

