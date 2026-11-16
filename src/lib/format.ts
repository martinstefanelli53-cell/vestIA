export function greeting(date = new Date()): string {
  const h = date.getHours();
  if (h >= 6 && h < 13) return "Buen día";
  if (h >= 13 && h < 20) return "Buenas tardes";
  return "Buenas noches";
}

/** Fecha local en formato YYYY-MM-DD (para comparar días sin problemas de huso). */
export function dayKey(date: Date | string = new Date()): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function longDate(date = new Date()): string {
  return date.toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long" });
}

export function shortDate(value: string): string {
  // Los campos `date` (YYYY-MM-DD) se interpretan como día local, no UTC.
  const d = value.length === 10 ? new Date(`${value}T12:00:00`) : new Date(value);
  return d.toLocaleDateString("es-AR", { day: "numeric", month: "short" });
}

export function weekdayShort(value: string): string {
  return new Date(`${value}T12:00:00`).toLocaleDateString("es-AR", { weekday: "short" }).replace(".", "");
}

export function timeAgo(value: string, now = Date.now()): string {
  const minutes = Math.max(0, Math.round((now - new Date(value).getTime()) / 60000));
  if (minutes < 1) return "recién";
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.round(hours / 24);
  return days === 1 ? "ayer" : `hace ${days} días`;
}

export function capitalize(text: string): string {
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : text;
}

export function lowerFirst(text: string): string {
  return text ? text.charAt(0).toLowerCase() + text.slice(1) : text;
}

/** "a, b y c" */
export function joinList(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} y ${items[items.length - 1]}`;
}

/** Estación del año según fecha y hemisferio (lat < 0 = sur). */
export function currentSeason(lat: number | null | undefined, date = new Date()): string {
  const north = ["invierno", "invierno", "primavera", "primavera", "primavera", "verano", "verano", "verano", "otoño", "otoño", "otoño", "invierno"];
  const season = north[date.getMonth()];
  if (lat === null || lat === undefined || lat < 0) {
    return { invierno: "verano", verano: "invierno", primavera: "otoño", otoño: "primavera" }[season]!;
  }
  return season;
}
