# VESTIA

Guardarropa digital con asistente de estilismo. Proyecto académico (Universidad de Palermo).

- **Frontend:** React 18 + TypeScript + Vite + Tailwind (mobile-first, PWA instalable).
- **Backend:** Supabase — Postgres con RLS, Auth, Storage y la Edge Function `api`.
- **IA:** Claude (reconocimiento de prendas y estilista) + motor de estilismo propio como respaldo.
- **Clima:** WeatherAPI.com (con Open-Meteo como proveedor de respaldo sin credenciales).

## Cómo correrla

```bash
npm install
npm run dev
```

Otros comandos: `npm run build` (verifica tipos y compila), `npm test` (pruebas del motor de estilismo).

El archivo `.env` trae la URL y la clave **pública** del proyecto Supabase. No contiene secretos.

## Credenciales a configurar

Se cargan en Supabase → **Edge Functions → Secrets** del proyecto (nunca en el frontend ni en el repositorio):

| Secret | Para qué | Si falta |
|---|---|---|
| `WEATHERAPI_KEY` | Clima con WeatherAPI.com (plan gratuito, https://www.weatherapi.com/) | Se usa Open-Meteo automáticamente |
| `ANTHROPIC_API_KEY` | Reconocimiento de prendas por foto y estilista conversacional con Claude | Reconocimiento local de colores + motor de estilismo por reglas |
| `ANTHROPIC_MODEL` | Opcional. Modelo a usar (por defecto `claude-opus-5-5`) | — |

No hace falta redesplegar: la función lee los secrets en cada solicitud.

Recomendado además en el panel de Supabase: activar *Leaked password protection* (Auth) y configurar un SMTP propio
para que los emails de recuperación de contraseña lleguen a cualquier dirección.

## Arquitectura

```
src/
  pages/        Pantallas: Home, Guardarropa, Outfit Exprés, Mis outfits, Inspiración, Progreso, Perfil, Premium
  components/   Sistema de diseño (ui.tsx) y componentes de dominio
  hooks/        Acceso a datos (React Query), sesión y clima
  styling/      Motor de estilismo, intérprete de pedidos, explicaciones y orquestador IA/motor
  lib/          Cliente del backend, imágenes, gamificación, feed, formato
supabase/
  migrations/   Esquema, RLS, límites por plan, storage
  functions/api/
    index.ts    Rutas + autenticación
    weather.ts  Proveedores de clima (interfaz WeatherProvider) + caché de 15 min
    ai.ts       Servicios de IA (clasificación y estilista) con salida estructurada y validación
    prompts.ts  System prompts del estilista y del clasificador
    account.ts  Alta, prueba Premium, baja de cuenta
    taxonomy.ts Taxonomía y contratos compartidos con el frontend (alias @shared)
scripts/import-catalog.mjs   Importador del catálogo de demostración (etapa 2)
docs/BENCHMARKING.md         Análisis de competencia y decisiones de producto
```

Decisiones clave:

- **Solo prendas reales.** La IA recibe el guardarropa leído de la base (con RLS) y el backend rechaza cualquier
  respuesta con prendas inexistentes, excluidas o sin las fijadas. El frontend valida además la estructura del outfit.
- **Motor + IA.** `src/styling/engine.ts` puntúa combinaciones por clima, ocasión, color, estampados, silueta,
  materiales, preferencias, variedad y valoraciones. Es el respaldo si la IA no está disponible y resuelve el
  reemplazo de una sola prenda al instante.
- **Límites en la base.** Los topes del plan (prendas y outfits cada 24 h) se aplican con triggers, no en el cliente.
- **Fotos.** Se conserva el archivo original sin modificar; aparte se guarda una miniatura para la grilla.
  El bucket `garments` es privado y cada persona solo accede a su carpeta.
- **Registro.** El MVP confirma el email automáticamente (ruta `/auth/signup`) porque el proyecto no tiene SMTP propio.
  Al configurarlo, conviene volver a exigir verificación.

## Etapa 2: galería de fotos del equipo

La estructura ya está creada y separada del guardarropa personal:

- **Catálogo de demostración:** tabla `catalog_items` + bucket público `catalog`. Se carga con
  `scripts/import-catalog.mjs` (instrucciones en el archivo). `garments.catalog_item_id` permite, más adelante,
  que una persona agregue una prenda del catálogo a su guardarropa sin mezclar ambos conjuntos.
- **Feed de inspiración:** subir la foto al bucket público `inspiration` y completar `inspiration_looks.image_path`.
  La tarjeta reemplaza sola el placeholder por la fotografía.

## Monetización

Tabla `plans` (límites) y `subscriptions` (estado, vencimiento y campos `provider_*` para la pasarela).
Hoy existe la prueba gratuita de 7 días; para cobrar, el webhook del proveedor de pagos debe actualizar
`subscriptions` (punto de extensión marcado en `account.ts`).

## Roadmap preparado

| Funcionalidad | Base ya disponible |
|---|---|
| Planificación semanal y calendario de looks | `outfit_wears.worn_on` admite fechas futuras |
| Valija inteligente | Motor con clima y ocasión; pronóstico por ubicación en `weather.ts` |
| Estadísticas avanzadas y prendas menos usadas | `wear_count`, `last_worn_on`, `lib/gamification.ts` |
| Recomendaciones de compra | Detección de faltantes (`wardrobe_gap`) y catálogo |
| Catálogo ampliado | `catalog_items` + importador |
| Mayor personalización del asistente | `profiles.style_notes`, valoraciones, prompts aislados |
| Comunidad | Looks en tabla propia (`inspiration_looks`), lista para contenido de usuarios |
