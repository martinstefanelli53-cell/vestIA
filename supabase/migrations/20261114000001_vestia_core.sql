-- VESTIA · esquema base (MVP)
-- Convenciones: RLS en todas las tablas públicas, funciones privilegiadas en el
-- esquema `private` (no expuesto por la Data API), timestamps en timestamptz.

create schema if not exists private;

-- ───────────────────────── Planes y suscripciones ─────────────────────────
create table public.plans (
  id text primary key,
  name text not null,
  garment_limit integer not null,
  daily_outfit_limit integer not null,
  history_days integer,                       -- null = historial ilimitado
  features jsonb not null default '{}'::jsonb
);

insert into public.plans (id, name, garment_limit, daily_outfit_limit, history_days, features) values
  ('free', 'Gratis', 30, 10, 14, '{"advanced_stats": false, "advanced_personalization": false, "ads": true}'),
  ('premium', 'Premium', 500, 100, null, '{"advanced_stats": true, "advanced_personalization": true, "ads": false}');

create table public.subscriptions (
  user_id uuid primary key references auth.users (id) on delete cascade,
  plan_id text not null default 'free' references public.plans (id),
  status text not null default 'active' check (status in ('active', 'trialing', 'canceled', 'expired')),
  trial_used boolean not null default false,
  current_period_end timestamptz,
  -- Preparado para la pasarela de pagos (etapa posterior)
  provider text,
  provider_customer_id text,
  provider_subscription_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index subscriptions_plan_id_idx on public.subscriptions (plan_id);

-- ───────────────────────────────── Perfil ─────────────────────────────────
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '',
  age_range text,
  location_mode text not null default 'auto' check (location_mode in ('auto', 'manual')),
  location_name text,
  location_region text,
  location_lat double precision,
  location_lon double precision,
  styles text[] not null default '{}',
  favorite_colors text[] not null default '{}',
  avoided_colors text[] not null default '{}',
  garment_types text[] not null default '{}',
  occasions text[] not null default '{}',
  comfort_priority smallint not null default 2 check (comfort_priority between 1 and 3),
  fit_preference text not null default 'regular' check (fit_preference in ('ajustado', 'regular', 'holgado')),
  style_notes text check (char_length(style_notes) <= 500),
  onboarding_completed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ──────────────────────────── Guardarropa personal ────────────────────────
create table public.garments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  category text not null check (category in ('top', 'bottom', 'dress', 'outerwear', 'shoes', 'accessory')),
  type text not null,
  primary_color text not null,
  secondary_colors text[] not null default '{}',
  pattern text not null default 'liso',
  styles text[] not null default '{}',
  seasons text[] not null default '{}',
  material text,
  fit text check (fit in ('ajustado', 'regular', 'holgado')),
  warmth smallint not null default 2 check (warmth between 1 and 5),
  formality smallint not null default 2 check (formality between 1 and 5),
  waterproof boolean not null default false,
  notes text check (char_length(notes) <= 300),
  is_favorite boolean not null default false,
  ai_classified boolean not null default false,
  ai_meta jsonb,
  wear_count integer not null default 0,
  last_worn_on date,
  catalog_item_id uuid,                       -- origen opcional en el catálogo de demostración
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index garments_user_created_idx on public.garments (user_id, created_at desc);

create table public.garment_images (
  id uuid primary key default gen_random_uuid(),
  garment_id uuid not null references public.garments (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  storage_path text not null,                 -- imagen original, sin modificar
  thumb_path text,                            -- miniatura generada en el cliente
  position smallint not null default 0,
  created_at timestamptz not null default now()
);
create index garment_images_garment_idx on public.garment_images (garment_id, position);
create index garment_images_user_idx on public.garment_images (user_id);

-- ───────────────────────────────── Outfits ────────────────────────────────
create table public.outfits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  occasion text,
  request_text text check (char_length(request_text) <= 500),
  explanation text,
  source text not null default 'engine' check (source in ('ai', 'engine')),
  weather jsonb,
  rain_mode text not null default 'real' check (rain_mode in ('real', 'rain', 'dry')),
  is_saved boolean not null default false,
  rating smallint check (rating in (-1, 1)),
  created_at timestamptz not null default now()
);
create index outfits_user_created_idx on public.outfits (user_id, created_at desc);

create table public.outfit_items (
  outfit_id uuid not null references public.outfits (id) on delete cascade,
  garment_id uuid not null references public.garments (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  slot text not null check (slot in ('top', 'bottom', 'dress', 'outerwear', 'shoes', 'accessory')),
  primary key (outfit_id, garment_id)
);
create index outfit_items_garment_idx on public.outfit_items (garment_id);
create index outfit_items_user_idx on public.outfit_items (user_id);

create table public.outfit_wears (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  outfit_id uuid not null references public.outfits (id) on delete cascade,
  worn_on date not null default current_date,
  created_at timestamptz not null default now(),
  unique (outfit_id, worn_on)
);
create index outfit_wears_user_day_idx on public.outfit_wears (user_id, worn_on desc);

-- ──────────────── Inspiración y catálogo de demostración ──────────────────
-- Ambos conjuntos son contenido del equipo: nunca se mezclan con `garments`.
create table public.inspiration_looks (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  description text not null,
  kind text not null default 'look' check (kind in ('look', 'combinacion', 'tendencia')),
  style text not null,
  occasion text,
  season text,
  palette text[] not null default '{}',
  pieces jsonb not null default '[]'::jsonb,
  tags text[] not null default '{}',
  image_path text,                            -- bucket `inspiration` (etapa 2)
  published boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table public.inspiration_saves (
  user_id uuid not null references auth.users (id) on delete cascade,
  look_id uuid not null references public.inspiration_looks (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, look_id)
);
create index inspiration_saves_look_idx on public.inspiration_saves (look_id);

create table public.catalog_items (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null check (category in ('top', 'bottom', 'dress', 'outerwear', 'shoes', 'accessory')),
  type text not null,
  primary_color text not null,
  secondary_colors text[] not null default '{}',
  pattern text not null default 'liso',
  styles text[] not null default '{}',
  seasons text[] not null default '{}',
  material text,
  fit text,
  warmth smallint not null default 2 check (warmth between 1 and 5),
  formality smallint not null default 2 check (formality between 1 and 5),
  waterproof boolean not null default false,
  image_path text not null,                   -- bucket `catalog`
  published boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.garments
  add constraint garments_catalog_item_fk foreign key (catalog_item_id) references public.catalog_items (id) on delete set null;
create index garments_catalog_item_idx on public.garments (catalog_item_id) where catalog_item_id is not null;

-- Caché del clima: solo la usa el backend (service role). Sin políticas a propósito.
create table public.weather_cache (
  cache_key text primary key,
  payload jsonb not null,
  fetched_at timestamptz not null default now()
);

-- ──────────────────────────────── Funciones ───────────────────────────────
create function private.set_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end $$;

create trigger profiles_updated before update on public.profiles for each row execute function private.set_updated_at();
create trigger garments_updated before update on public.garments for each row execute function private.set_updated_at();
create trigger subscriptions_updated before update on public.subscriptions for each row execute function private.set_updated_at();

-- Alta de usuario: crea perfil y suscripción gratuita.
create function private.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, left(coalesce(new.raw_user_meta_data ->> 'display_name', ''), 60));
  insert into public.subscriptions (user_id) values (new.id);
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function private.handle_new_user();

-- Plan vigente de un usuario (premium solo si la suscripción está activa y no venció).
create function public.plan_for(uid uuid) returns text
language sql stable security invoker set search_path = '' as $$
  select coalesce((
    select s.plan_id from public.subscriptions s
    where s.user_id = uid
      and s.status in ('active', 'trialing')
      and (s.current_period_end is null or s.current_period_end > now())
  ), 'free')
$$;

-- Límites del plan, aplicados en la base para que no dependan del cliente.
create function private.enforce_garment_limit() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  lim integer;
  cnt integer;
begin
  select p.garment_limit into lim from public.plans p where p.id = public.plan_for(new.user_id);
  select count(*) into cnt from public.garments g where g.user_id = new.user_id;
  if cnt >= lim then
    raise exception 'garment_limit_reached' using errcode = 'P0001', hint = lim::text;
  end if;
  return new;
end $$;
create trigger garments_limit before insert on public.garments for each row execute function private.enforce_garment_limit();

create function private.enforce_outfit_limit() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  lim integer;
  cnt integer;
begin
  select p.daily_outfit_limit into lim from public.plans p where p.id = public.plan_for(new.user_id);
  select count(*) into cnt from public.outfits o
  where o.user_id = new.user_id and o.created_at > now() - interval '24 hours';
  if cnt >= lim then
    raise exception 'outfit_limit_reached' using errcode = 'P0001', hint = lim::text;
  end if;
  return new;
end $$;
create trigger outfits_limit before insert on public.outfits for each row execute function private.enforce_outfit_limit();

-- Registrar un uso actualiza las estadísticas de cada prenda del outfit.
create function private.apply_outfit_wear() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  target uuid := coalesce(new.outfit_id, old.outfit_id);
begin
  update public.garments g
  set wear_count = sub.cnt, last_worn_on = sub.last_day
  from (
    select i.garment_id,
           count(w.id)::integer as cnt,
           max(w.worn_on) as last_day
    from public.outfit_items i
    left join public.outfit_items i2 on i2.garment_id = i.garment_id
    left join public.outfit_wears w on w.outfit_id = i2.outfit_id
    where i.outfit_id = target
    group by i.garment_id
  ) sub
  where g.id = sub.garment_id;
  return null;
end $$;
create trigger outfit_wears_apply after insert or delete on public.outfit_wears for each row execute function private.apply_outfit_wear();

-- Resumen de plan, límites y consumo para el cliente (una sola consulta).
create function public.my_entitlements() returns jsonb
language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'plan', to_jsonb(p),
    'status', s.status,
    'trial_used', coalesce(s.trial_used, false),
    'current_period_end', s.current_period_end,
    'garment_count', (select count(*) from public.garments g where g.user_id = (select auth.uid())),
    'outfits_last_24h', (select count(*) from public.outfits o
                         where o.user_id = (select auth.uid()) and o.created_at > now() - interval '24 hours')
  )
  from public.plans p
  left join public.subscriptions s on s.user_id = (select auth.uid())
  where p.id = public.plan_for((select auth.uid()))
$$;

revoke execute on function public.plan_for(uuid) from public, anon;
revoke execute on function public.my_entitlements() from public, anon;
grant execute on function public.plan_for(uuid) to authenticated, service_role;
grant execute on function public.my_entitlements() to authenticated;

-- ─────────────────────────── Permisos y RLS ───────────────────────────────
grant select on public.plans, public.subscriptions, public.inspiration_looks, public.catalog_items to authenticated;
grant select, update on public.profiles to authenticated;
grant select, insert, update, delete on public.garments, public.garment_images, public.outfits,
  public.outfit_items, public.outfit_wears, public.inspiration_saves to authenticated;

alter table public.plans enable row level security;
alter table public.subscriptions enable row level security;
alter table public.profiles enable row level security;
alter table public.garments enable row level security;
alter table public.garment_images enable row level security;
alter table public.outfits enable row level security;
alter table public.outfit_items enable row level security;
alter table public.outfit_wears enable row level security;
alter table public.inspiration_looks enable row level security;
alter table public.inspiration_saves enable row level security;
alter table public.catalog_items enable row level security;
alter table public.weather_cache enable row level security;

create policy "plans: lectura" on public.plans for select to authenticated using (true);
create policy "subscriptions: propia" on public.subscriptions for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "profiles: leer propio" on public.profiles for select to authenticated
  using ((select auth.uid()) = id);
create policy "profiles: editar propio" on public.profiles for update to authenticated
  using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

create policy "garments: propias" on public.garments for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "garment_images: propias" on public.garment_images for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "outfits: propios" on public.outfits for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "outfit_items: propios" on public.outfit_items for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "outfit_wears: propios" on public.outfit_wears for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "inspiration_saves: propios" on public.inspiration_saves for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create policy "inspiration_looks: publicados" on public.inspiration_looks for select to authenticated
  using (published);
create policy "catalog_items: publicados" on public.catalog_items for select to authenticated
  using (published);

-- ──────────────────────────────── Storage ─────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('garments', 'garments', false, 15728640, array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']),
  ('catalog', 'catalog', true, 15728640, array['image/jpeg', 'image/png', 'image/webp']),
  ('inspiration', 'inspiration', true, 15728640, array['image/jpeg', 'image/png', 'image/webp']);

-- Cada usuario solo accede a su carpeta: garments/{user_id}/...
create policy "garments bucket: leer propias" on storage.objects for select to authenticated
  using (bucket_id = 'garments' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "garments bucket: subir propias" on storage.objects for insert to authenticated
  with check (bucket_id = 'garments' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "garments bucket: actualizar propias" on storage.objects for update to authenticated
  using (bucket_id = 'garments' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'garments' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "garments bucket: borrar propias" on storage.objects for delete to authenticated
  using (bucket_id = 'garments' and (storage.foldername(name))[1] = (select auth.uid())::text);
