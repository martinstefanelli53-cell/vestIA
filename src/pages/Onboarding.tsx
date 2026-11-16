import { useState } from "react";
import { ArrowRight, LocateFixed, MapPin } from "lucide-react";
import { COLOR_NAMES, OCCASIONS, STYLES } from "@shared/taxonomy.ts";
import { Logo } from "@/components/Logo";
import { useToast } from "@/components/Toast";
import { Button, ChipGroup, ColorPicker, ProgressBar } from "@/components/ui";
import { LocationSheet } from "@/components/Weather";
import { friendlyError, useProfile, useUpdateProfile } from "@/hooks/data";
import { useWeather } from "@/hooks/weather";

const STEPS = 3;

export function OnboardingPage() {
  const { data: profile } = useProfile();
  const update = useUpdateProfile();
  const { locate } = useWeather();
  const toast = useToast();
  const [step, setStep] = useState(1);
  const [styles, setStyles] = useState<string[]>(profile?.styles ?? []);
  const [colors, setColors] = useState<string[]>(profile?.favorite_colors ?? []);
  const [occasions, setOccasions] = useState<string[]>(profile?.occasions ?? []);
  const [locating, setLocating] = useState(false);
  const [cityOpen, setCityOpen] = useState(false);

  const hasLocation = profile?.location_lat !== null && profile?.location_lat !== undefined;

  const finish = async () => {
    try {
      await update.mutateAsync({ styles, favorite_colors: colors, occasions, onboarding_completed: true });
    } catch (e) {
      toast(friendlyError(e), "error");
    }
  };

  const useMyLocation = async () => {
    setLocating(true);
    try { await locate(); toast("Ubicación detectada"); } catch (e) { toast(friendlyError(e), "error"); } finally { setLocating(false); }
  };

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-xl flex-col px-6 py-8">
      <header className="flex items-center justify-between">
        <Logo className="text-lg" />
        <button type="button" onClick={finish} className="text-[13px] font-medium text-graphite underline-offset-4 hover:text-ink hover:underline">Omitir por ahora</button>
      </header>
      <div className="mt-6"><ProgressBar value={step} max={STEPS} tone="ink" /></div>

      <main key={step} className="flex-1 py-10 animate-fade-up">
        <p className="eyebrow">Paso {step} de {STEPS}</p>
        {step === 1 && (
          <>
            <h1 className="mt-2 text-3xl font-semibold leading-tight">{profile?.display_name ? `${profile.display_name}, ¿cómo` : "¿Cómo"} te gusta vestirte?</h1>
            <p className="mt-2 text-sm text-graphite">Elegí hasta 4 estilos. Los usamos para que cada outfit se sienta tuyo.</p>
            <div className="mt-7"><ChipGroup options={STYLES} value={styles} onChange={setStyles} max={4} /></div>
          </>
        )}
        {step === 2 && (
          <>
            <h1 className="mt-2 text-3xl font-semibold leading-tight">Tus colores y tu rutina</h1>
            <p className="mt-2 text-sm text-graphite">¿Qué colores preferís usar?</p>
            <div className="mt-4"><ColorPicker options={COLOR_NAMES} value={colors} onChange={setColors} multiple max={6} /></div>
            <p className="mb-3 mt-8 text-sm text-graphite">¿Para qué ocasiones te vestís más seguido?</p>
            <ChipGroup options={OCCASIONS.map((o) => o.id)} value={occasions} onChange={setOccasions} label={(id) => OCCASIONS.find((o) => o.id === id)!.label} />
          </>
        )}
        {step === 3 && (
          <>
            <h1 className="mt-2 text-3xl font-semibold leading-tight">El clima de tu zona</h1>
            <p className="mt-2 text-sm leading-relaxed text-graphite">VESTIA adapta cada outfit a la temperatura y a la lluvia. Solo usamos tu ubicación para consultar el clima.</p>
            <div className="mt-7 space-y-3">
              {hasLocation && (
                <p className="flex items-center gap-2 rounded-xl bg-mist px-4 py-3 text-sm font-medium">
                  <MapPin className="h-4 w-4 text-crimson" /> {profile?.location_name ?? "Ubicación detectada"}
                </p>
              )}
              <Button variant="dark" full loading={locating} onClick={useMyLocation} icon={<LocateFixed className="h-4 w-4" />}>Usar mi ubicación</Button>
              <Button variant="outline" full onClick={() => setCityOpen(true)}>Elegir mi ciudad</Button>
            </div>
          </>
        )}
      </main>

      <footer className="flex items-center gap-3 pb-4">
        {step > 1 && <Button variant="outline" onClick={() => setStep(step - 1)}>Atrás</Button>}
        {step < STEPS ? (
          <Button className="flex-1" onClick={() => setStep(step + 1)} icon={<ArrowRight className="h-4 w-4" />}>Continuar</Button>
        ) : (
          <Button className="flex-1" loading={update.isPending} onClick={finish}>{hasLocation ? "Empezar" : "Empezar sin clima"}</Button>
        )}
      </footer>
      <LocationSheet open={cityOpen} onClose={() => setCityOpen(false)} />
    </div>
  );
}
