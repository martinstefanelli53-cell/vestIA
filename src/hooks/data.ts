// Acceso a datos (Supabase + React Query). Las pantallas no hablan con la base
// directamente: usan estos hooks, que centralizan caché e invalidaciones.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { GarmentAttributes, StylingWeather } from "@shared/taxonomy.ts";
import { api, UserError } from "@/lib/api";
import { GARMENT_BUCKET, supabase } from "@/lib/supabase";
import type { Category } from "@shared/taxonomy.ts";
import type { InspirationPiece } from "@/lib/inspirationVision";
import type { Entitlements, Garment, Outfit, Plan, Profile, RainMode } from "@/lib/types";
import { useUserId } from "./auth";

/** Traduce errores técnicos a mensajes claros para la persona. */
export function friendlyError(error: unknown): string {
  const message = String((error as { message?: string })?.message ?? "");
  if (message.includes("garment_limit_reached")) return "Llegaste al límite de prendas de tu plan.";
  if (message.includes("outfit_limit_reached")) return "Llegaste al límite de outfits por día de tu plan.";
  if (/failed to fetch|networkerror/i.test(message)) return "Sin conexión. Revisá tu internet e intentá de nuevo.";
  return error instanceof UserError ? message : "Ocurrió un error inesperado. Intentá de nuevo.";
}

export const isLimitError = (error: unknown) => /_limit_reached/.test(String((error as { message?: string })?.message ?? ""));

function unwrap<T>(result: { data: T | null; error: { message: string } | null }): T {
  if (result.error) throw new Error(result.error.message);
  return result.data as T;
}

// ───────────────────────────── Perfil ─────────────────────────────
export function useProfile() {
  const uid = useUserId();
  return useQuery({
    queryKey: ["profile", uid],
    queryFn: async () => unwrap(await supabase.from("profiles").select("*").eq("id", uid).single()) as Profile,
    staleTime: 5 * 60_000,
  });
}

export function useUpdateProfile() {
  const uid = useUserId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch: Partial<Profile>) =>
      unwrap(await supabase.from("profiles").update(patch).eq("id", uid).select("*").single()) as Profile,
    onSuccess: (profile) => qc.setQueryData(["profile", uid], profile),
  });
}

// ─────────────────────────── Guardarropa ───────────────────────────
export function useGarments() {
  const uid = useUserId();
  return useQuery({
    queryKey: ["garments", uid],
    staleTime: 20 * 60_000, // las URLs firmadas duran 1 h
    queryFn: async (): Promise<Garment[]> => {
      const rows = unwrap(
        await supabase.from("garments").select("*, garment_images(id, storage_path, thumb_path, position)").order("created_at", { ascending: false }),
      ) as Omit<Garment, "thumbUrl">[];
      const covers = rows.map((g) => {
        g.garment_images.sort((a, b) => a.position - b.position);
        const cover = g.garment_images[0];
        return cover ? cover.thumb_path ?? cover.storage_path : null;
      });
      const paths = covers.filter((p): p is string => Boolean(p));
      const urls = new Map<string, string>();
      if (paths.length) {
        const { data } = await supabase.storage.from(GARMENT_BUCKET).createSignedUrls(paths, 3600);
        data?.forEach((s) => s.path && s.signedUrl && urls.set(s.path, s.signedUrl));
      }
      return rows.map((g, i) => ({ ...g, thumbUrl: covers[i] ? urls.get(covers[i]!) ?? null : null }));
    },
  });
}

export interface NewImage {
  file: File;
  thumb: Blob;
}

export interface SaveGarmentInput {
  id?: string;
  attributes: GarmentAttributes & { notes: string | null };
  aiClassified?: boolean;
  newImages: NewImage[];
  removedImages?: { id: string; storage_path: string; thumb_path: string | null }[];
  existingImageCount?: number;
}

export function useSaveGarment() {
  const uid = useUserId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: SaveGarmentInput) => {
      let garmentId = input.id;
      if (garmentId) {
        unwrap(await supabase.from("garments").update(input.attributes).eq("id", garmentId).select("id").single());
      } else {
        const row = unwrap(
          await supabase.from("garments").insert({ ...input.attributes, user_id: uid, ai_classified: input.aiClassified ?? false }).select("id").single(),
        ) as { id: string };
        garmentId = row.id;
      }

      if (input.removedImages?.length) {
        const paths = input.removedImages.flatMap((i) => [i.storage_path, i.thumb_path]).filter((p): p is string => Boolean(p));
        await supabase.storage.from(GARMENT_BUCKET).remove(paths);
        unwrap(await supabase.from("garment_images").delete().in("id", input.removedImages.map((i) => i.id)).select("id"));
      }

      let position = (input.existingImageCount ?? 0) - (input.removedImages?.length ?? 0);
      for (const image of input.newImages) {
        const key = crypto.randomUUID();
        const ext = image.file.type === "image/png" ? "png" : image.file.type === "image/webp" ? "webp" : "jpg";
        const storagePath = `${uid}/${garmentId}/${key}.${ext}`;
        const thumbPath = `${uid}/${garmentId}/${key}_thumb.jpg`;
        // Se sube el archivo original tal cual, sin recomprimir.
        const original = await supabase.storage.from(GARMENT_BUCKET).upload(storagePath, image.file, { contentType: image.file.type });
        if (original.error) throw new UserError("No se pudo subir la foto. Intentá de nuevo.");
        await supabase.storage.from(GARMENT_BUCKET).upload(thumbPath, image.thumb, { contentType: "image/jpeg" });
        unwrap(
          await supabase.from("garment_images").insert({ garment_id: garmentId, user_id: uid, storage_path: storagePath, thumb_path: thumbPath, position: position++ }).select("id").single(),
        );
      }
      return garmentId;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["garments", uid] });
      qc.invalidateQueries({ queryKey: ["entitlements", uid] });
    },
  });
}

export function useDeleteGarment() {
  const uid = useUserId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (garment: Garment) => {
      const paths = garment.garment_images.flatMap((i) => [i.storage_path, i.thumb_path]).filter((p): p is string => Boolean(p));
      if (paths.length) await supabase.storage.from(GARMENT_BUCKET).remove(paths);
      unwrap(await supabase.from("garments").delete().eq("id", garment.id).select("id"));
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["garments", uid] });
      qc.invalidateQueries({ queryKey: ["outfits", uid] });
      qc.invalidateQueries({ queryKey: ["entitlements", uid] });
    },
  });
}

export function useToggleFavorite() {
  const uid = useUserId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (garment: Garment) =>
      unwrap(await supabase.from("garments").update({ is_favorite: !garment.is_favorite }).eq("id", garment.id).select("id").single()),
    onMutate: (garment) => {
      qc.setQueryData<Garment[]>(["garments", uid], (list) => list?.map((g) => (g.id === garment.id ? { ...g, is_favorite: !g.is_favorite } : g)));
    },
    onError: () => qc.invalidateQueries({ queryKey: ["garments", uid] }),
  });
}

export async function signedImageUrl(path: string): Promise<string | null> {
  const { data } = await supabase.storage.from(GARMENT_BUCKET).createSignedUrl(path, 3600);
  return data?.signedUrl ?? null;
}

// ───────────────────────────── Outfits ─────────────────────────────
const OUTFIT_SELECT = "*, outfit_items(garment_id, slot), outfit_wears(id, worn_on)";

export function useOutfits() {
  const uid = useUserId();
  return useQuery({
    queryKey: ["outfits", uid],
    queryFn: async () => unwrap(await supabase.from("outfits").select(OUTFIT_SELECT).order("created_at", { ascending: false }).limit(300)) as Outfit[],
    staleTime: 60_000,
  });
}

export interface OutfitDraft {
  items: Garment[];
  occasion: string | null;
  request_text: string | null;
  explanation: string;
  source: "ai" | "engine";
  weather: StylingWeather | null;
  rain_mode: RainMode;
}

export function useOutfitActions() {
  const uid = useUserId();
  const qc = useQueryClient();
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["outfits", uid] });
    qc.invalidateQueries({ queryKey: ["entitlements", uid] });
  };
  const patchCache = (id: string, patch: Partial<Outfit>) =>
    qc.setQueryData<Outfit[]>(["outfits", uid], (list) => list?.map((o) => (o.id === id ? { ...o, ...patch } : o)));
  const itemRows = (outfitId: string, items: Garment[]) =>
    items.map((g) => ({ outfit_id: outfitId, garment_id: g.id, user_id: uid, slot: g.category }));

  return {
    async create(draft: OutfitDraft): Promise<Outfit> {
      const { items, ...fields } = draft;
      const row = unwrap(await supabase.from("outfits").insert({ ...fields, user_id: uid }).select("id").single()) as { id: string };
      unwrap(await supabase.from("outfit_items").insert(itemRows(row.id, items)).select("garment_id"));
      const outfit = unwrap(await supabase.from("outfits").select(OUTFIT_SELECT).eq("id", row.id).single()) as Outfit;
      qc.setQueryData<Outfit[]>(["outfits", uid], (list) => [outfit, ...(list ?? [])]);
      qc.invalidateQueries({ queryKey: ["entitlements", uid] });
      return outfit;
    },
    /** Reemplaza las prendas de un outfit existente (cambio de una sola prenda). */
    async replaceItems(outfitId: string, items: Garment[], explanation: string): Promise<void> {
      unwrap(await supabase.from("outfit_items").delete().eq("outfit_id", outfitId).select("garment_id"));
      unwrap(await supabase.from("outfit_items").insert(itemRows(outfitId, items)).select("garment_id"));
      unwrap(await supabase.from("outfits").update({ explanation, source: "engine" }).eq("id", outfitId).select("id").single());
      patchCache(outfitId, { explanation, source: "engine", outfit_items: items.map((g) => ({ garment_id: g.id, slot: g.category })) });
    },
    async update(outfitId: string, patch: Partial<Pick<Outfit, "is_saved" | "rating">>): Promise<void> {
      patchCache(outfitId, patch);
      const { error } = await supabase.from("outfits").update(patch).eq("id", outfitId);
      if (error) { refresh(); throw new Error(error.message); }
    },
    async logWear(outfitId: string, day: string): Promise<void> {
      const { error } = await supabase.from("outfit_wears").upsert({ outfit_id: outfitId, user_id: uid, worn_on: day }, { onConflict: "outfit_id,worn_on", ignoreDuplicates: true });
      if (error) throw new Error(error.message);
      refresh();
      qc.invalidateQueries({ queryKey: ["garments", uid] });
    },
    async removeWear(wearId: string): Promise<void> {
      unwrap(await supabase.from("outfit_wears").delete().eq("id", wearId).select("id"));
      refresh();
      qc.invalidateQueries({ queryKey: ["garments", uid] });
    },
    async remove(outfitId: string): Promise<void> {
      unwrap(await supabase.from("outfits").delete().eq("id", outfitId).select("id"));
      qc.setQueryData<Outfit[]>(["outfits", uid], (list) => list?.filter((o) => o.id !== outfitId));
      qc.invalidateQueries({ queryKey: ["garments", uid] });
      qc.invalidateQueries({ queryKey: ["entitlements", uid] });
    },
  };
}

// ─────────────────────── Plan, inspiración y backend ───────────────────────
export function useEntitlements() {
  const uid = useUserId();
  return useQuery({
    queryKey: ["entitlements", uid],
    queryFn: async () => unwrap(await supabase.rpc("my_entitlements")) as Entitlements,
    staleTime: 60_000,
  });
}

export function usePlans() {
  return useQuery({
    queryKey: ["plans"],
    queryFn: async () => unwrap(await supabase.from("plans").select("*")) as Plan[],
    staleTime: 60 * 60_000,
  });
}

// ───────────────────────── Mi inspiración ─────────────────────────
export interface Inspiration {
  id: string;
  title: string;
  image_path: string;
  thumb_path: string | null;
  pieces: InspirationPiece[];
  created_at: string;
  imageUrl: string | null;
}

export function useInspirations() {
  const uid = useUserId();
  return useQuery({
    queryKey: ["inspirations", uid],
    staleTime: 20 * 60_000, // las URLs firmadas duran 1 h
    queryFn: async (): Promise<Inspiration[]> => {
      const rows = unwrap(await supabase.from("user_inspirations").select("*").order("created_at", { ascending: false })) as Omit<Inspiration, "imageUrl">[];
      const paths = rows.map((r) => r.thumb_path ?? r.image_path);
      const urls = new Map<string, string>();
      if (paths.length) {
        const { data } = await supabase.storage.from(GARMENT_BUCKET).createSignedUrls(paths, 3600);
        data?.forEach((u) => u.path && u.signedUrl && urls.set(u.path, u.signedUrl));
      }
      return rows.map((r, i) => ({ ...r, imageUrl: urls.get(paths[i]) ?? null }));
    },
  });
}

export function useSaveInspiration() {
  const uid = useUserId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { file: File; thumb: Blob; title: string; pieces: InspirationPiece[] }) => {
      const key = crypto.randomUUID();
      const ext = input.file.type === "image/png" ? "png" : input.file.type === "image/webp" ? "webp" : "jpg";
      const imagePath = `${uid}/inspiration/${key}.${ext}`;
      const thumbPath = `${uid}/inspiration/${key}_thumb.jpg`;
      const up = await supabase.storage.from(GARMENT_BUCKET).upload(imagePath, input.file, { contentType: input.file.type });
      if (up.error) throw new UserError("No se pudo subir la foto. Intentá de nuevo.");
      await supabase.storage.from(GARMENT_BUCKET).upload(thumbPath, input.thumb, { contentType: "image/jpeg" });
      return unwrap(
        await supabase.from("user_inspirations").insert({ user_id: uid, title: input.title, image_path: imagePath, thumb_path: thumbPath, pieces: input.pieces }).select("id").single(),
      ) as { id: string };
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["inspirations", uid] }),
  });
}

export function useUpdateInspiration() {
  const uid = useUserId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...patch }: { id: string; title?: string; pieces?: InspirationPiece[] }) => {
      unwrap(await supabase.from("user_inspirations").update(patch).eq("id", id).select("id").single());
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["inspirations", uid] }),
  });
}

// ───────────────────────── Lista de deseos ─────────────────────────
export interface WishlistItem {
  id: string;
  inspiration_id: string | null;
  category: Category;
  type: string;
  color: string;
  pattern: string;
  source_title: string;
  acquired: boolean;
  created_at: string;
}

export function useWishlist() {
  const uid = useUserId();
  return useQuery({
    queryKey: ["wishlist", uid],
    queryFn: async () => unwrap(await supabase.from("wishlist_items").select("*").order("created_at", { ascending: false })) as WishlistItem[],
  });
}

export function useAddToWishlist() {
  const uid = useUserId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ inspirationId, sourceTitle, pieces }: { inspirationId: string | null; sourceTitle: string; pieces: InspirationPiece[] }) => {
      const rows = pieces.map((p) => ({
        user_id: uid, inspiration_id: inspirationId, source_title: sourceTitle, category: p.category, type: p.type, color: p.color, pattern: p.pattern,
      }));
      unwrap(await supabase.from("wishlist_items").insert(rows).select("id"));
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["wishlist", uid] }),
  });
}

export function useUpdateWishlistItem() {
  const uid = useUserId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, acquired }: { id: string; acquired: boolean }) => {
      unwrap(await supabase.from("wishlist_items").update({ acquired }).eq("id", id).select("id").single());
    },
    onMutate: ({ id, acquired }) => {
      qc.setQueryData<WishlistItem[]>(["wishlist", uid], (list) => list?.map((i) => (i.id === id ? { ...i, acquired } : i)));
    },
    onError: () => qc.invalidateQueries({ queryKey: ["wishlist", uid] }),
  });
}

export function useDeleteWishlistItem() {
  const uid = useUserId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      unwrap(await supabase.from("wishlist_items").delete().eq("id", id).select("id"));
    },
    onMutate: (id) => {
      qc.setQueryData<WishlistItem[]>(["wishlist", uid], (list) => list?.filter((i) => i.id !== id));
    },
    onError: () => qc.invalidateQueries({ queryKey: ["wishlist", uid] }),
  });
}

/** Borra del storage todas las referencias de la persona (se usa antes de dar de baja la cuenta). */
export async function purgeInspirationFiles(uid: string): Promise<void> {
  const folder = `${uid}/inspiration`;
  const { data } = await supabase.storage.from(GARMENT_BUCKET).list(folder, { limit: 1000 });
  const paths = (data ?? []).filter((f) => f.id).map((f) => `${folder}/${f.name}`);
  if (paths.length) await supabase.storage.from(GARMENT_BUCKET).remove(paths);
}

export function useDeleteInspiration() {
  const uid = useUserId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (item: Inspiration) => {
      const paths = [item.image_path, item.thumb_path].filter((p): p is string => Boolean(p));
      await supabase.storage.from(GARMENT_BUCKET).remove(paths);
      unwrap(await supabase.from("user_inspirations").delete().eq("id", item.id).select("id"));
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["inspirations", uid] }),
  });
}

/** Estado de las integraciones del backend (IA configurada, proveedor de clima). */
export function useBackendStatus() {
  const uid = useUserId();
  return useQuery({
    queryKey: ["backend-status", uid],
    queryFn: () => api<{ ai: boolean; weatherProvider: string }>("/status"),
    staleTime: 10 * 60_000,
    retry: 1,
  });
}
