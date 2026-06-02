-- SchrodingerFridge - setup Supabase completo
-- Esegui tutto in Supabase > SQL Editor.
-- L'app statica NON può creare tabelle da sola: questa query crea tabella, RLS, policy e realtime.

create table if not exists public.items (
  id text primary key,
  family_code text not null,
  list_type text not null check (list_type in ('product','shopping','cart')),
  name text not null,
  category text not null default 'dispensa',
  qty integer not null default 1,
  unit text default '',
  notes text default '',
  checked boolean not null default false,
  confirmed boolean not null default false,
  origin_category text default 'dispensa',
  added_at bigint not null default (extract(epoch from now()) * 1000)::bigint,
  checked_at bigint,
  updated_at bigint not null default (extract(epoch from now()) * 1000)::bigint,
  expiry date
);

create index if not exists items_family_code_idx on public.items(family_code);
create index if not exists items_family_type_idx on public.items(family_code, list_type);
create index if not exists items_added_at_idx on public.items(added_at);

alter table public.items enable row level security;

drop policy if exists "anon can read family items" on public.items;
drop policy if exists "anon can insert family items" on public.items;
drop policy if exists "anon can update family items" on public.items;
drop policy if exists "anon can delete family items" on public.items;
drop policy if exists "public anon read items" on public.items;
drop policy if exists "public anon insert items" on public.items;
drop policy if exists "public anon update items" on public.items;
drop policy if exists "public anon delete items" on public.items;

-- App senza login: allow anon. La separazione è per family_code, non per utenti autenticati.
create policy "public anon read items"
on public.items for select
to anon
using (true);

create policy "public anon insert items"
on public.items for insert
to anon
with check (family_code is not null and length(trim(family_code)) >= 4);

create policy "public anon update items"
on public.items for update
to anon
using (true)
with check (family_code is not null and length(trim(family_code)) >= 4);

create policy "public anon delete items"
on public.items for delete
to anon
using (true);

grant usage on schema public to anon;
grant select, insert, update, delete on public.items to anon;

alter publication supabase_realtime add table public.items;

-- Test manuale facoltativo:
-- insert into public.items(id,family_code,list_type,name,category)
-- values ('test-1','PROVA-1234','shopping','Latte','frigo')
-- on conflict (id) do update set name=excluded.name;
