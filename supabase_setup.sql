-- SchrodinFridge / SchrodingerFridge - setup tabella Supabase
-- Esegui in Supabase: SQL Editor -> New query -> Run.
-- Nota: questa configurazione abilita lettura/scrittura anonima per far funzionare una PWA statica su GitHub Pages.
-- Usa codici famiglia non ovvi; per sicurezza vera servirebbe autenticazione Supabase.

create table if not exists public.items (
  id text primary key,
  family_code text not null,
  list_type text not null check (list_type in ('product','shopping','cart')),
  name text not null,
  category text default 'dispensa',
  qty numeric default 1,
  unit text default '',
  notes text default '',
  checked boolean default false,
  confirmed boolean default false,
  origin_category text default 'dispensa',
  added_at bigint,
  checked_at bigint,
  updated_at bigint,
  expiry date
);

alter table public.items add column if not exists family_code text;
alter table public.items add column if not exists list_type text;
alter table public.items add column if not exists name text;
alter table public.items add column if not exists category text default 'dispensa';
alter table public.items add column if not exists qty numeric default 1;
alter table public.items add column if not exists unit text default '';
alter table public.items add column if not exists notes text default '';
alter table public.items add column if not exists checked boolean default false;
alter table public.items add column if not exists confirmed boolean default false;
alter table public.items add column if not exists origin_category text default 'dispensa';
alter table public.items add column if not exists added_at bigint;
alter table public.items add column if not exists checked_at bigint;
alter table public.items add column if not exists updated_at bigint;
alter table public.items add column if not exists expiry date;

create index if not exists items_family_code_idx on public.items (family_code);
create index if not exists items_family_type_idx on public.items (family_code, list_type);

alter table public.items enable row level security;

drop policy if exists "SchrodinFridge anon select" on public.items;
drop policy if exists "SchrodinFridge anon insert" on public.items;
drop policy if exists "SchrodinFridge anon update" on public.items;
drop policy if exists "SchrodinFridge anon delete" on public.items;

create policy "SchrodinFridge anon select" on public.items
  for select to anon, authenticated using (true);

create policy "SchrodinFridge anon insert" on public.items
  for insert to anon, authenticated with check (true);

create policy "SchrodinFridge anon update" on public.items
  for update to anon, authenticated using (true) with check (true);

create policy "SchrodinFridge anon delete" on public.items
  for delete to anon, authenticated using (true);

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on public.items to anon, authenticated;

-- Realtime: aggiungi la tabella alla publication solo se non c'è già.
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'items'
  ) then
    alter publication supabase_realtime add table public.items;
  end if;
end $$;
