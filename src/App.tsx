import { Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "./components/AppShell";
import { Logo } from "./components/Logo";
import { Button, Spinner } from "./components/ui";
import { useAuth } from "./hooks/auth";
import { useProfile } from "./hooks/data";
import { WeatherProvider } from "./hooks/weather";
import { AuthPage, ResetPasswordPage } from "./pages/Auth";
import { FeedPage } from "./pages/Feed";
import { HomePage } from "./pages/Home";
import { OnboardingPage } from "./pages/Onboarding";
import { OutfitExpressPage } from "./pages/OutfitExpress";
import { OutfitsPage } from "./pages/Outfits";
import { PremiumPage } from "./pages/Premium";
import { ProfilePage } from "./pages/Profile";
import { ProgressPage } from "./pages/Progress";
import { WardrobePage } from "./pages/Wardrobe";

function Splash() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-6">
      <Logo className="text-2xl" />
      <Spinner />
    </div>
  );
}

function Authenticated() {
  const profile = useProfile();
  const { signOut } = useAuth();

  if (profile.isLoading) return <Splash />;
  if (profile.isError || !profile.data) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
        <Logo className="text-2xl" />
        <p className="max-w-xs text-sm text-graphite">No pudimos cargar tu perfil. Revisá tu conexión e intentá de nuevo.</p>
        <div className="flex gap-2">
          <Button variant="dark" onClick={() => profile.refetch()}>Reintentar</Button>
          <Button variant="outline" onClick={signOut}>Cerrar sesión</Button>
        </div>
      </div>
    );
  }

  return (
    <WeatherProvider>
      {!profile.data.onboarding_completed ? (
        <OnboardingPage />
      ) : (
        <AppShell>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/guardarropa" element={<WardrobePage />} />
            <Route path="/outfit" element={<OutfitExpressPage />} />
            <Route path="/outfits" element={<OutfitsPage />} />
            <Route path="/inspiracion" element={<FeedPage />} />
            <Route path="/progreso" element={<ProgressPage />} />
            <Route path="/perfil" element={<ProfilePage />} />
            <Route path="/premium" element={<PremiumPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AppShell>
      )}
    </WeatherProvider>
  );
}

export function App() {
  const { session, loading, recovering } = useAuth();
  if (loading) return <Splash />;
  if (recovering) return <ResetPasswordPage />;
  if (!session) return <AuthPage />;
  return <Authenticated />;
}
