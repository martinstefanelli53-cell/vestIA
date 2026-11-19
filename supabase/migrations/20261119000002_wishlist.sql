-- Lista de deseos: prendas que a la persona le faltan, opcionalmente ligadas a una
-- referencia de "Mi inspiración". Cambio aditivo: no toca tablas existentes.
create table public.wishlist_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  inspiration_id uuid references public.user_inspirations (id) on delete set null,
  category text not null check (category in ('top', 'bottom', 'dress', 'outerwear', 'shoes', 'accessory')),
  type text not null,
  color text not null,
  pattern text not null default 'liso',
  source_title text not null default '',  -- nombre del look, para no perder el contexto si se borra
  acquired boolean not null default false,
  created_at timestamptz not null default now()
);
create index wishlist_items_user_idx on public.wishlist_items (user_id, acquired, created_at desc);
create index wishlist_items_inspiration_idx on public.wishlist_items (inspiration_id);

alter table public.wishlist_items enable row level security;
create policy "wishlist: leer propias" on public.wishlist_items for select to authenticated using (user_id = (select auth.uid()));
create policy "wishlist: crear propias" on public.wishlist_items for insert to authenticated with check (user_id = (select auth.uid()));
create policy "wishlist: editar propias" on public.wishlist_items for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "wishlist: borrar propias" on public.wishlist_items for delete to authenticated using (user_id = (select auth.uid()));
