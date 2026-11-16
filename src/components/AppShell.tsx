import type { ReactNode } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { BarChart3, Compass, Crown, History, Home, Shirt, Sparkles, User } from "lucide-react";
import { useEntitlements } from "@/hooks/data";
import { Logo } from "./Logo";
import { cx } from "./ui";

interface NavItem { to: string; label: string; icon: typeof Home; end?: boolean; primary?: boolean }

const NAV: NavItem[] = [
  { to: "/", label: "Inicio", icon: Home, end: true },
  { to: "/guardarropa", label: "Guardarropa", icon: Shirt },
  { to: "/outfit", label: "Outfit Exprés", icon: Sparkles, primary: true },
  { to: "/inspiracion", label: "Inspiración", icon: Compass },
  { to: "/perfil", label: "Perfil", icon: User },
];
const SECONDARY: NavItem[] = [
  { to: "/outfits", label: "Mis outfits", icon: History },
  { to: "/progreso", label: "Mi progreso", icon: BarChart3 },
];

export function AppShell({ children }: { children: ReactNode }) {
  const { data: entitlements } = useEntitlements();
  const { pathname } = useLocation();
  const premium = entitlements?.plan.id === "premium";

  return (
    <div className="min-h-dvh bg-paper">
      {/* Navegación lateral (desktop) */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-black/[0.06] bg-paper px-5 py-7 md:flex">
        <NavLink to="/" className="mb-10 px-2 text-xl" aria-label="VESTIA, ir al inicio"><Logo /></NavLink>
        <nav className="flex flex-1 flex-col gap-1" aria-label="Principal">
          {[...NAV.slice(0, 3), ...SECONDARY, ...NAV.slice(3)].map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) => cx(
                "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors duration-150",
                isActive ? "bg-ink text-white" : "text-graphite hover:bg-mist hover:text-ink",
              )}
            >
              <Icon className="h-[18px] w-[18px]" strokeWidth={1.8} />
              {label}
            </NavLink>
          ))}
        </nav>
        <NavLink to="/premium" className="group rounded-card bg-mist p-4 transition-colors hover:bg-black/[0.08]">
          <p className="flex items-center gap-1.5 text-[13px] font-semibold"><Crown className="h-4 w-4 text-crimson" /> {premium ? "Plan Premium" : "Plan Gratis"}</p>
          <p className="mt-1 text-xs leading-relaxed text-graphite">{premium ? "Tenés todas las funciones activas." : "Conocé todo lo que suma Premium."}</p>
        </NavLink>
      </aside>

      {/* Barra superior (mobile) */}
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-black/[0.05] bg-paper/90 px-4 backdrop-blur md:hidden">
        <NavLink to="/" className="text-base" aria-label="VESTIA, ir al inicio"><Logo /></NavLink>
        <div className="flex items-center gap-1">
          {SECONDARY.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} aria-label={label} title={label} className={({ isActive }) => cx("flex h-10 w-10 items-center justify-center rounded-full transition-colors", isActive ? "bg-ink text-white" : "text-ink hover:bg-mist")}>
              <Icon className="h-[18px] w-[18px]" strokeWidth={1.8} />
            </NavLink>
          ))}
        </div>
      </header>

      <main key={pathname} className="mx-auto w-full max-w-5xl px-4 pb-32 pt-6 animate-fade-in sm:px-6 md:pb-16 md:pl-[17rem] md:pr-8 md:pt-10 lg:max-w-6xl">
        {children}
      </main>

      {/* Navegación inferior (mobile) */}
      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 items-end bg-paper/95 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 shadow-nav backdrop-blur md:hidden" aria-label="Principal">
        {NAV.map(({ to, label, icon: Icon, end, primary }) => (
          <NavLink key={to} to={to} end={end} className="group flex flex-col items-center gap-1 text-[10px] font-medium">
            {({ isActive }) => primary ? (
              <>
                <span className={cx("-mt-6 flex h-14 w-14 items-center justify-center rounded-full text-white shadow-lift transition-transform duration-150 group-active:scale-90", isActive ? "bg-crimson-dark" : "bg-crimson")}>
                  <Icon className="h-6 w-6" strokeWidth={1.8} />
                </span>
                <span className={isActive ? "text-crimson" : "text-graphite"}>Outfit</span>
              </>
            ) : (
              <>
                <span className={cx("flex h-8 w-12 items-center justify-center rounded-full transition-colors duration-150", isActive ? "text-ink" : "text-graphite/70")}>
                  <Icon className="h-[22px] w-[22px]" strokeWidth={isActive ? 2.2 : 1.7} />
                </span>
                <span className={isActive ? "text-ink" : "text-graphite"}>{label}</span>
              </>
            )}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
