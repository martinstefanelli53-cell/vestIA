/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        crimson: { DEFAULT: "#AE1D22", dark: "#8E171B", soft: "#FBF0F0" },
        ink: "#000000",
        graphite: "#555555",
        mist: "#EFEFEF",
        paper: "#FFFFFF",
      },
      fontFamily: {
        sans: ['"Inter Variable"', "Inter", "system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"],
      },
      borderRadius: { card: "14px" },
      boxShadow: {
        card: "0 1px 2px rgba(0,0,0,0.04), 0 10px 28px -16px rgba(0,0,0,0.18)",
        lift: "0 2px 4px rgba(0,0,0,0.05), 0 18px 40px -18px rgba(0,0,0,0.28)",
        nav: "0 -1px 0 rgba(0,0,0,0.06), 0 -12px 30px -18px rgba(0,0,0,0.18)",
      },
      letterSpacing: { label: "0.16em" },
      keyframes: {
        "fade-up": { from: { opacity: "0", transform: "translateY(8px)" }, to: { opacity: "1", transform: "translateY(0)" } },
        "fade-in": { from: { opacity: "0" }, to: { opacity: "1" } },
        "sheet-up": { from: { transform: "translateY(24px)", opacity: "0" }, to: { transform: "translateY(0)", opacity: "1" } },
      },
      animation: {
        "fade-up": "fade-up 0.35s ease-out both",
        "fade-in": "fade-in 0.2s ease-out both",
        "sheet-up": "sheet-up 0.28s cubic-bezier(0.2,0.8,0.2,1) both",
      },
    },
  },
  plugins: [],
};
