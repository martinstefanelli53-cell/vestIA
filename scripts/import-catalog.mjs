// Etapa 2 · Importa la galería de fotos del equipo al CATÁLOGO DE DEMOSTRACIÓN
// (tabla `catalog_items` + bucket público `catalog`). No toca el guardarropa
// personal de ningún usuario.
//
// Uso:
//   SUPABASE_URL=https://<ref>.supabase.co SUPABASE_SERVICE_ROLE_KEY=<service role> \
//     node scripts/import-catalog.mjs ./galeria ./galeria/catalogo.json
//
// `catalogo.json` es un arreglo con una ficha por foto (mismos campos que una prenda):
//   [{ "file": "camisa-blanca.jpg", "name": "Camisa blanca", "category": "top", "type": "camisa",
//      "primary_color": "blanco", "secondary_colors": [], "pattern": "liso", "styles": ["clásico"],
//      "seasons": ["verano","otoño","invierno","primavera"], "material": "algodón", "fit": "regular",
//      "warmth": 2, "formality": 3, "waterproof": false }]
// La service role key es secreta: usarla solo en esta terminal, nunca en el frontend.
import { readFile } from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const [dir, manifestPath] = process.argv.slice(2);
const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
if (!dir || !manifestPath || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Faltan argumentos o variables. Ver instrucciones al inicio del archivo.");
  process.exit(1);
}
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const TYPES = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp" };

const items = JSON.parse(await readFile(manifestPath, "utf8"));
let ok = 0;
for (const { file, ...attributes } of items) {
  const contentType = TYPES[path.extname(file).toLowerCase()];
  if (!contentType) { console.warn(`· ${file}: formato no compatible, se omite`); continue; }
  const upload = await supabase.storage.from("catalog").upload(file, await readFile(path.join(dir, file)), { contentType, upsert: true });
  if (upload.error) { console.warn(`· ${file}: ${upload.error.message}`); continue; }
  const { error } = await supabase.from("catalog_items").insert({ ...attributes, image_path: file });
  if (error) console.warn(`· ${file}: ${error.message}`); else ok += 1;
}
console.log(`Catálogo: ${ok} de ${items.length} prendas importadas.`);
