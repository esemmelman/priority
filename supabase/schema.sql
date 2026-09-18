create table if not exists public.priority_items_v1 (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 200),
  position integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists priority_items_v1_position_idx on public.priority_items_v1 (position, created_at);
alter table public.priority_items_v1 enable row level security;
grant select, insert, update, delete on public.priority_items_v1 to anon, authenticated;
create policy "Anyone can read priority items" on public.priority_items_v1 for select to anon, authenticated using (true);
create policy "Anyone can add priority items" on public.priority_items_v1 for insert to anon, authenticated with check (true);
create policy "Anyone can edit priority items" on public.priority_items_v1 for update to anon, authenticated using (true) with check (true);
create policy "Anyone can delete priority items" on public.priority_items_v1 for delete to anon, authenticated using (true);
