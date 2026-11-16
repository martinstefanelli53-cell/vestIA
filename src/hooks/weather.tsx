// Clima en tiempo real + selector de lluvia. El clima llega del backend
// (WeatherAPI.com); acá se resuelve la ubicación y el escenario efectivo que
// usa Outfit Exprés (clima real o simulación con/sin lluvia).
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import type { PlaceResult, StylingWeather, WeatherSnapshot } from "@shared/taxonomy.ts";
import { api, UserError } from "@/lib/api";
import type { RainMode } from "@/lib/types";
import { useProfile, useUpdateProfile } from "./data";

type Status = "loading" | "ready" | "needs-location" | "error";

interface WeatherState {
  status: Status;
  snapshot: WeatherSnapshot | null;
  error: string | null;
  isFetching: boolean;
  refresh(): void;
  rainMode: RainMode;
  setRainMode(mode: RainMode): void;
  /** Escenario climático que usa el estilismo; null si no hay datos. */
  styling: StylingWeather | null;
  /** Pide permiso de geolocalización y guarda la ubicación detectada. */
  locate(): Promise<void>;
  setManualLocation(place: PlaceResult): Promise<void>;
}

const WeatherContext = createContext<WeatherState | null>(null);

export function isRaining(snapshot: WeatherSnapshot): boolean {
  return ["rain", "storm"].includes(snapshot.current.kind) || snapshot.current.precipMm > 0.1 || snapshot.today.chanceOfRain >= 60;
}

export function toStylingWeather(snapshot: WeatherSnapshot, mode: RainMode): StylingWeather {
  return {
    feelsLikeC: snapshot.current.feelsLikeC,
    minC: snapshot.today.minC,
    maxC: snapshot.today.maxC,
    rain: mode === "real" ? isRaining(snapshot) : mode === "rain",
    condition: snapshot.current.condition,
    simulated: mode !== "real",
  };
}

function currentPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!("geolocation" in navigator)) return reject(new UserError("Tu dispositivo no permite detectar la ubicación."));
    navigator.geolocation.getCurrentPosition(resolve, (err) => {
      reject(new UserError(err.code === err.PERMISSION_DENIED
        ? "No tenemos permiso para usar tu ubicación. Podés elegir tu ciudad manualmente."
        : "No pudimos detectar tu ubicación. Podés elegir tu ciudad manualmente."));
    }, { timeout: 10_000, maximumAge: 10 * 60_000 });
  });
}

export function WeatherProvider({ children }: { children: ReactNode }) {
  const { data: profile } = useProfile();
  const updateProfile = useUpdateProfile();
  const [rainMode, setRainMode] = useState<RainMode>("real");
  const autoChecked = useRef(false);

  const lat = profile?.location_lat ?? null;
  const lon = profile?.location_lon ?? null;
  const hasLocation = lat !== null && lon !== null;

  const query = useQuery({
    queryKey: ["weather", lat?.toFixed(2), lon?.toFixed(2)],
    enabled: hasLocation,
    queryFn: () => api<WeatherSnapshot>(`/weather?lat=${lat}&lon=${lon}&name=${encodeURIComponent(profile?.location_name ?? "")}`),
    staleTime: 10 * 60_000,
    refetchInterval: 20 * 60_000, // actualización periódica sin saturar el servicio
    refetchOnWindowFocus: true,
    retry: 1,
  });

  const locate = useCallback(async () => {
    const position = await currentPosition();
    await updateProfile.mutateAsync({
      location_mode: "auto",
      location_lat: Number(position.coords.latitude.toFixed(4)),
      location_lon: Number(position.coords.longitude.toFixed(4)),
      location_name: null,
      location_region: null,
    });
  }, [updateProfile]);

  // En modo automático, si el permiso ya fue concedido se actualiza la ubicación al abrir la app.
  useEffect(() => {
    if (!profile || profile.location_mode !== "auto" || autoChecked.current) return;
    autoChecked.current = true;
    navigator.permissions?.query({ name: "geolocation" }).then((result) => {
      if (result.state !== "granted") return;
      currentPosition().then((position) => {
        const moved = !hasLocation || Math.abs(position.coords.latitude - lat!) > 0.05 || Math.abs(position.coords.longitude - lon!) > 0.05;
        if (moved) locate().catch(() => undefined);
      }).catch(() => undefined);
    }).catch(() => undefined);
  }, [profile, hasLocation, lat, lon, locate]);

  // WeatherAPI devuelve el nombre de la localidad: se guarda para mostrarlo en el perfil.
  const snapshot = query.data ?? null;
  useEffect(() => {
    if (profile && snapshot && !profile.location_name && snapshot.provider === "weatherapi" && snapshot.location.name) {
      updateProfile.mutate({ location_name: snapshot.location.name, location_region: snapshot.location.region });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshot?.location.name, profile?.location_name]);

  const value = useMemo<WeatherState>(() => {
    const status: Status = !profile ? "loading" : !hasLocation ? "needs-location" : snapshot ? "ready" : query.isError ? "error" : "loading";
    return {
      status,
      snapshot,
      error: query.isError ? (query.error as Error).message : null,
      isFetching: query.isFetching,
      refresh: () => void query.refetch(),
      rainMode,
      setRainMode,
      styling: snapshot ? toStylingWeather(snapshot, rainMode) : null,
      locate,
      async setManualLocation(place) {
        await updateProfile.mutateAsync({
          location_mode: "manual",
          location_lat: place.lat,
          location_lon: place.lon,
          location_name: place.name,
          location_region: [place.region, place.country].filter(Boolean).join(", "),
        });
      },
    };
  }, [profile, hasLocation, snapshot, query, rainMode, locate, updateProfile]);

  return <WeatherContext.Provider value={value}>{children}</WeatherContext.Provider>;
}

export function useWeather(): WeatherState {
  const ctx = useContext(WeatherContext);
  if (!ctx) throw new Error("useWeather debe usarse dentro de WeatherProvider");
  return ctx;
}
