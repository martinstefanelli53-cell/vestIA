import { cx } from "./ui";

/**
 * Logotipo VESTIA. La "A" final no tiene travesaño: lo reemplaza un trazo
 * carmesí, el detalle distintivo de la marca.
 */
export function Logo({ className, tone = "dark" }: { className?: string; tone?: "dark" | "light" }) {
  return (
    <span
      className={cx("inline-flex items-baseline font-semibold leading-none tracking-[0.32em]", tone === "light" ? "text-white" : "text-ink", className)}
      role="img"
      aria-label="VESTIA"
    >
      <span aria-hidden>VESTI</span>
      <svg aria-hidden viewBox="0 0 22 20" className="h-[0.72em] w-auto overflow-visible" fill="none">
        <path d="M1.6 20 11 1.2 20.4 20" stroke="currentColor" strokeWidth="3" strokeLinejoin="miter" />
        <path d="M6.6 14.4h8.8" stroke="#AE1D22" strokeWidth="3" />
      </svg>
    </span>
  );
}
