// Sistema de diseño de VESTIA: componentes base reutilizables.
import { useEffect, type ButtonHTMLAttributes, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Check, Loader2, X } from "lucide-react";
import { colorHex } from "@/styling/colors";
import { capitalize } from "@/lib/format";

export function cx(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(" ");
}

// ─────────────────────────────── Botones ───────────────────────────────
type ButtonVariant = "primary" | "dark" | "outline" | "ghost" | "danger";
type ButtonSize = "sm" | "md" | "lg";

const VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-crimson text-white hover:bg-crimson-dark shadow-[0_8px_20px_-10px_rgba(174,29,34,0.7)]",
  dark: "bg-ink text-white hover:bg-black/85",
  outline: "border border-black/15 bg-paper text-ink hover:border-ink",
  ghost: "text-ink hover:bg-mist",
  danger: "border border-crimson/30 text-crimson hover:bg-crimson-soft",
};
const SIZES: Record<ButtonSize, string> = {
  sm: "h-9 px-3.5 text-[13px]",
  md: "h-11 px-5 text-sm",
  lg: "h-12 px-6 text-[15px]",
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: ReactNode;
  full?: boolean;
}

export function Button({ variant = "primary", size = "md", loading, icon, full, className, children, disabled, type = "button", ...rest }: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      className={cx(
        "inline-flex select-none items-center justify-center gap-2 rounded-full font-medium transition-all duration-150",
        "active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none disabled:active:scale-100",
        VARIANTS[variant], SIZES[size], full && "w-full", className,
      )}
      {...rest}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : icon}
      {children}
    </button>
  );
}

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  active?: boolean;
  tone?: "light" | "plain";
}

export function IconButton({ label, active, tone = "plain", className, children, type = "button", ...rest }: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      aria-pressed={active}
      className={cx(
        "inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-all duration-150 active:scale-90",
        "disabled:cursor-not-allowed disabled:opacity-40",
        tone === "light" ? "bg-paper/90 shadow-card backdrop-blur hover:bg-paper" : "hover:bg-mist",
        active ? "text-crimson" : "text-ink",
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

// ─────────────────────────────── Chips ───────────────────────────────
interface ChipProps {
  selected?: boolean;
  onClick?: () => void;
  children: ReactNode;
  disabled?: boolean;
  size?: "sm" | "md";
}

export function Chip({ selected, onClick, children, disabled, size = "md" }: ChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={selected}
      className={cx(
        "inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border font-medium transition-all duration-150 active:scale-95",
        "disabled:cursor-not-allowed disabled:opacity-40",
        size === "sm" ? "h-8 px-3 text-xs" : "h-9 px-4 text-[13px]",
        selected ? "border-ink bg-ink text-white" : "border-black/12 bg-paper text-ink hover:border-ink",
      )}
    >
      {children}
    </button>
  );
}

interface ChipGroupProps<T extends string> {
  options: readonly T[];
  value: T[];
  onChange: (next: T[]) => void;
  max?: number;
  label?: (option: T) => string;
}

/** Selección múltiple con chips. */
export function ChipGroup<T extends string>({ options, value, onChange, max, label = capitalize as (o: T) => string }: ChipGroupProps<T>) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((option) => {
        const selected = value.includes(option);
        return (
          <Chip
            key={option}
            selected={selected}
            disabled={!selected && max !== undefined && value.length >= max}
            onClick={() => onChange(selected ? value.filter((v) => v !== option) : [...value, option])}
          >
            {label(option)}
          </Chip>
        );
      })}
    </div>
  );
}

interface SegmentedProps<T extends string | number> {
  options: { value: T; label: ReactNode }[];
  value: T;
  onChange: (value: T) => void;
  ariaLabel: string;
  tone?: "light" | "dark";
}

export function Segmented<T extends string | number>({ options, value, onChange, ariaLabel, tone = "light" }: SegmentedProps<T>) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className={cx("grid gap-1 rounded-full p-1", tone === "dark" ? "bg-white/10" : "bg-mist")} style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={String(option.value)}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(option.value)}
            className={cx(
              "flex h-9 items-center justify-center gap-1.5 rounded-full px-2 text-[13px] font-medium transition-all duration-200",
              selected
                ? tone === "dark" ? "bg-paper text-ink shadow-card" : "bg-paper text-ink shadow-card"
                : tone === "dark" ? "text-white/70 hover:text-white" : "text-graphite hover:text-ink",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

// ─────────────────────────── Campos y color ───────────────────────────
export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-baseline justify-between gap-3">
        <span className="text-[13px] font-medium text-ink">{label}</span>
        {hint && <span className="text-xs text-graphite">{hint}</span>}
      </span>
      {children}
    </label>
  );
}

export function ColorDot({ color, size = 14 }: { color: string; size?: number }) {
  return (
    <span
      className="inline-block shrink-0 rounded-full ring-1 ring-black/15"
      style={{ width: size, height: size, backgroundColor: colorHex(color) }}
      aria-hidden
    />
  );
}

interface ColorPickerProps {
  options: readonly string[];
  value: string[];
  onChange: (next: string[]) => void;
  multiple?: boolean;
  max?: number;
}

export function ColorPicker({ options, value, onChange, multiple, max }: ColorPickerProps) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((color) => {
        const selected = value.includes(color);
        const full = multiple && !selected && max !== undefined && value.length >= max;
        return (
          <button
            key={color}
            type="button"
            title={capitalize(color)}
            aria-label={capitalize(color)}
            aria-pressed={selected}
            disabled={full}
            onClick={() => onChange(multiple ? (selected ? value.filter((c) => c !== color) : [...value, color]) : [color])}
            className={cx(
              "relative flex h-9 w-9 items-center justify-center rounded-full transition-all duration-150 active:scale-90 disabled:opacity-30",
              selected ? "ring-2 ring-ink ring-offset-2" : "ring-1 ring-black/15 hover:ring-black/40",
            )}
            style={{ backgroundColor: colorHex(color) }}
          >
            {selected && <Check className={cx("h-4 w-4", ["blanco", "crema", "beige", "amarillo", "celeste", "plateado", "rosa", "lila"].includes(color) ? "text-ink" : "text-white")} />}
          </button>
        );
      })}
    </div>
  );
}

// ─────────────────────── Estados y estructura ───────────────────────
export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cx("h-5 w-5 animate-spin text-graphite", className)} aria-label="Cargando" />;
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx("animate-pulse rounded-card bg-mist", className)} />;
}

export function EmptyState({ icon, title, text, action }: { icon?: ReactNode; title: string; text: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center rounded-card border border-dashed border-black/15 px-6 py-12 text-center animate-fade-up">
      {icon && <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-mist text-ink">{icon}</div>}
      <h3 className="text-lg font-semibold">{title}</h3>
      <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-graphite">{text}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function PageHeader({ overline, title, action }: { overline?: string; title: string; action?: ReactNode }) {
  return (
    <header className="mb-6 flex items-end justify-between gap-4">
      <div className="min-w-0">
        {overline && <p className="eyebrow mb-1.5">{overline}</p>}
        <h1 className="text-[28px] font-semibold leading-tight sm:text-4xl">{title}</h1>
      </div>
      {action}
    </header>
  );
}

export function SectionTitle({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <h2 className="text-lg font-semibold">{title}</h2>
      {action}
    </div>
  );
}

export function ProgressBar({ value, max, tone = "crimson" }: { value: number; max: number; tone?: "crimson" | "ink" | "white" }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div className={cx("h-1.5 w-full overflow-hidden rounded-full", tone === "white" ? "bg-white/20" : "bg-mist")} role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={max}>
      <div
        className={cx("h-full rounded-full transition-[width] duration-500 ease-out", tone === "crimson" ? "bg-crimson" : tone === "ink" ? "bg-ink" : "bg-paper")}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

// ─────────────────────────────── Sheet ───────────────────────────────
interface SheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: "md" | "lg";
}

/** Panel modal: hoja inferior en mobile, diálogo centrado en desktop. */
export function Sheet({ open, onClose, title, children, footer, size = "md" }: SheetProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);

  if (!open) return null;
  // Portal al <body>: el panel queda por encima de la navegación sin depender del
  // contexto de apilamiento de la pantalla que lo abre.
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 bg-black/45 animate-fade-in" onClick={onClose} />
      <div className={cx("relative flex max-h-[94dvh] w-full flex-col rounded-t-3xl bg-paper shadow-lift animate-sheet-up sm:rounded-3xl", size === "lg" ? "sm:max-w-2xl" : "sm:max-w-lg")}>
        <div className="flex items-center justify-between gap-3 border-b border-black/[0.06] px-5 py-3.5">
          <h2 className="truncate text-base font-semibold">{title}</h2>
          <IconButton label="Cerrar" onClick={onClose} className="-mr-2"><X className="h-5 w-5" /></IconButton>
        </div>
        <div className="flex-1 overflow-y-auto overscroll-contain px-5 py-5">{children}</div>
        {footer && <div className="border-t border-black/[0.06] px-5 py-3.5 pb-[max(0.875rem,env(safe-area-inset-bottom))]">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

interface ConfirmProps {
  open: boolean;
  title: string;
  text: string;
  confirmLabel: string;
  onConfirm: () => void;
  onClose: () => void;
  loading?: boolean;
}

export function ConfirmDialog({ open, title, text, confirmLabel, onConfirm, onClose, loading }: ConfirmProps) {
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <div className="flex gap-2">
          <Button variant="outline" full onClick={onClose}>Cancelar</Button>
          <Button full loading={loading} onClick={onConfirm}>{confirmLabel}</Button>
        </div>
      }
    >
      <p className="text-sm leading-relaxed text-graphite">{text}</p>
    </Sheet>
  );
}
