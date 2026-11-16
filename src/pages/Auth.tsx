import { useState, type FormEvent } from "react";
import { ArrowLeft } from "lucide-react";
import { Logo } from "@/components/Logo";
import { Button, cx, Field } from "@/components/ui";
import { useAuth } from "@/hooks/auth";
import { friendlyError } from "@/hooks/data";
import { supabase } from "@/lib/supabase";

type Mode = "login" | "signup" | "forgot";

function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      <aside className="relative hidden flex-col justify-between overflow-hidden bg-ink p-12 text-white lg:flex">
        <Logo tone="light" className="text-2xl" />
        <div>
          <p className="eyebrow !text-white/50">Tu guardarropa, con criterio</p>
          <h2 className="mt-4 max-w-md text-5xl font-semibold leading-[1.05]">Vestite mejor con lo que ya tenés.</h2>
          <p className="mt-5 max-w-sm text-[15px] leading-relaxed text-white/65">
            Digitalizá tu ropa y dejá que tu estilista con inteligencia artificial arme el outfit según el clima, la ocasión y tu estilo.
          </p>
        </div>
        <ul className="flex gap-8 text-[11px] font-medium uppercase tracking-label text-white/50">
          <li>Organización</li><li>Personalización</li><li>Inspiración</li>
        </ul>
        <div className="pointer-events-none absolute -right-24 top-1/3 h-72 w-72 rounded-full bg-crimson/30 blur-3xl" />
      </aside>
      <main className="flex flex-col justify-center px-6 py-10 sm:px-12">
        <div className="mx-auto w-full max-w-sm animate-fade-up">{children}</div>
      </main>
    </div>
  );
}

export function AuthPage() {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState<Mode>("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      if (mode === "login") await signIn(email, password);
      else if (mode === "signup") await signUp(name.trim(), email, password);
      else {
        const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: window.location.origin });
        if (resetError) throw new Error(resetError.message);
        setNotice("Si ese email tiene una cuenta, te enviamos un enlace para crear una contraseña nueva.");
      }
    } catch (e) {
      setError(mode === "forgot" ? "No pudimos enviar el email. Intentá de nuevo en unos minutos." : friendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  const switchMode = (next: Mode) => { setMode(next); setError(null); setNotice(null); };

  return (
    <AuthLayout>
      <Logo className="mb-10 text-2xl lg:hidden" />
      {mode === "forgot" ? (
        <button type="button" onClick={() => switchMode("login")} className="mb-6 flex items-center gap-1.5 text-sm font-medium text-graphite hover:text-ink">
          <ArrowLeft className="h-4 w-4" /> Volver
        </button>
      ) : (
        <div className="mb-8 grid grid-cols-2 gap-1 rounded-full bg-mist p-1" role="tablist">
          {(["login", "signup"] as const).map((m) => (
            <button key={m} type="button" role="tab" aria-selected={mode === m} onClick={() => switchMode(m)}
              className={cx("h-10 rounded-full text-sm font-medium transition-all duration-200", mode === m ? "bg-paper shadow-card" : "text-graphite hover:text-ink")}>
              {m === "login" ? "Ingresar" : "Crear cuenta"}
            </button>
          ))}
        </div>
      )}

      <h1 className="text-3xl font-semibold">
        {mode === "login" ? "Hola de nuevo" : mode === "signup" ? "Creá tu cuenta" : "Recuperá tu acceso"}
      </h1>
      <p className="mt-2 text-sm text-graphite">
        {mode === "login" ? "Ingresá para ver tu guardarropa y tus outfits." : mode === "signup" ? "En un minuto vas a tener tu guardarropa digital." : "Ingresá tu email y te enviamos un enlace."}
      </p>

      <form onSubmit={submit} className="mt-8 space-y-4" noValidate>
        {mode === "signup" && (
          <Field label="Nombre">
            <input className="field" value={name} onChange={(e) => setName(e.target.value)} autoComplete="given-name" maxLength={60} required placeholder="¿Cómo te llamás?" />
          </Field>
        )}
        <Field label="Email">
          <input className="field" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required placeholder="vos@email.com" />
        </Field>
        {mode !== "forgot" && (
          <Field label="Contraseña" hint={mode === "signup" ? "Mínimo 8 caracteres" : undefined}>
            <input className="field" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === "login" ? "current-password" : "new-password"} minLength={8} required placeholder="••••••••" />
          </Field>
        )}

        {error && <p role="alert" className="rounded-xl bg-crimson-soft px-3.5 py-2.5 text-[13px] font-medium text-crimson">{error}</p>}
        {notice && <p role="status" className="rounded-xl bg-mist px-3.5 py-2.5 text-[13px]">{notice}</p>}

        <Button type="submit" size="lg" full loading={busy}
          disabled={!email.trim() || (mode !== "forgot" && password.length < 8) || (mode === "signup" && !name.trim())}>
          {mode === "login" ? "Ingresar" : mode === "signup" ? "Crear cuenta" : "Enviar enlace"}
        </Button>
      </form>

      {mode === "login" && (
        <button type="button" onClick={() => switchMode("forgot")} className="mt-5 block w-full text-center text-[13px] font-medium text-graphite underline-offset-4 hover:text-ink hover:underline">
          ¿Olvidaste tu contraseña?
        </button>
      )}
    </AuthLayout>
  );
}

export function ResetPasswordPage() {
  const { finishRecovery } = useAuth();
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (updateError) setError("No pudimos actualizar la contraseña. Pedí un enlace nuevo e intentá otra vez.");
    else finishRecovery();
  };

  return (
    <AuthLayout>
      <Logo className="mb-10 text-2xl lg:hidden" />
      <h1 className="text-3xl font-semibold">Nueva contraseña</h1>
      <p className="mt-2 text-sm text-graphite">Elegí una contraseña nueva para tu cuenta.</p>
      <form onSubmit={submit} className="mt-8 space-y-4">
        <Field label="Contraseña nueva" hint="Mínimo 8 caracteres">
          <input className="field" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" minLength={8} required />
        </Field>
        {error && <p role="alert" className="rounded-xl bg-crimson-soft px-3.5 py-2.5 text-[13px] font-medium text-crimson">{error}</p>}
        <Button type="submit" size="lg" full loading={busy} disabled={password.length < 8}>Guardar contraseña</Button>
      </form>
    </AuthLayout>
  );
}
