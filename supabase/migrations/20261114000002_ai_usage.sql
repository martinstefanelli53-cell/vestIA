-- Cupo diario de llamadas a la IA por usuario. Solo lo usa el backend
-- (service role): RLS habilitado y sin políticas a propósito.
create table public.ai_usage (
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  kind text not null check (kind in ('classify', 'stylist')),
  count integer not null default 0,
  primary key (user_id, day, kind)
);
alter table public.ai_usage enable row level security;
