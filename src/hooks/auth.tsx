import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { useQueryClient } from "@tanstack/react-query";
import { api, UserError } from "@/lib/api";
import { supabase } from "@/lib/supabase";

interface AuthState {
  session: Session | null;
  userId: string | null;
  email: string | null;
  loading: boolean;
  /** true cuando la persona llegó desde el enlace de recuperación de contraseña. */
  recovering: boolean;
  signIn(email: string, password: string): Promise<void>;
  signUp(displayName: string, email: string, password: string): Promise<void>;
  signOut(): Promise<void>;
  finishRecovery(): void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [recovering, setRecovering] = useState(false);
  const queryClient = useQueryClient();

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, next) => {
      setSession(next);
      if (event === "PASSWORD_RECOVERY") setRecovering(true);
      if (event === "SIGNED_OUT") queryClient.clear();
    });
    return () => sub.subscription.unsubscribe();
  }, [queryClient]);

  const value = useMemo<AuthState>(() => ({
    session,
    userId: session?.user.id ?? null,
    email: session?.user.email ?? null,
    loading,
    recovering,
    async signIn(email, password) {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (error) {
        throw new UserError(error.message.includes("Invalid login") ? "Email o contraseña incorrectos." : "No se pudo iniciar sesión. Intentá de nuevo.");
      }
    },
    async signUp(displayName, email, password) {
      await api("/auth/signup", { body: { displayName, email, password } });
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (error) throw new UserError("La cuenta se creó, pero no se pudo iniciar sesión. Probá ingresar.");
    },
    async signOut() {
      await supabase.auth.signOut();
    },
    finishRecovery: () => setRecovering(false),
  }), [session, loading, recovering]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth debe usarse dentro de AuthProvider");
  return ctx;
}

/** Id del usuario autenticado; solo para pantallas detrás del login. */
export function useUserId(): string {
  const { userId } = useAuth();
  if (!userId) throw new Error("No hay sesión activa");
  return userId;
}
