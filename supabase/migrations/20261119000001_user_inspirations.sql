-- "Mi inspiración": referencias privadas que sube cada usuario. Cambio aditivo:
-- no toca ninguna tabla existente, así que la versión estable no se ve afectada.
create table public.user_inspirations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null default '',
  image_path text not null,   -- bucket privado `garments`, carpeta {user_id}/inspiration/
  thumb_path text,
  pieces jsonb not null default '[]'::jsonb,  -- [{category,type,color,secondary,pattern}]
  created_at timestamptz not null default now()
);
create index user_inspirations_user_idx on public.user_inspirations (user_id, created_at desc);

alter table public.user_inspirations enable row level security;
create policy "inspirations: leer propias" on public.user_inspirations for select to authenticated
  using (user_id = (select auth.uid()));
create policy "inspirations: crear propias" on public.user_inspirations for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy "inspirations: editar propias" on public.user_inspirations for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "inspirations: borrar propias" on public.user_inspirations for delete to authenticated
  using (user_id = (select auth.uid()));
