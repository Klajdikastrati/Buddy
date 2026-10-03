-- Buddy schema v1 — Foundation + Money.
-- Paste into Supabase → SQL Editor → Run. Safe to read top to bottom:
-- every table is owned per user and protected by RLS.
--
-- Sync model (see docs/ARCHITECTURE.md):
--   * ids are generated on the phone (uuid), rows are upserted whole
--   * updated_at   = when the user changed it (client clock) → last-write-wins
--   * server_updated_at = when the server received it → pull cursor
--   * no hard deletes from the app; deleted_at is a soft delete

-- ---------------------------------------------------------------------------
-- Shared trigger: stamp server time, ignore stale writes, pin ownership.
-- ---------------------------------------------------------------------------
create or replace function public.buddy_sync_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    -- An older edit arriving late (e.g. from a second device) must not win.
    if new.updated_at < old.updated_at then
      return null;
    end if;
    new.user_id := old.user_id;
  end if;
  new.server_updated_at := clock_timestamp();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- profiles — one row per user: settings
-- ---------------------------------------------------------------------------
create table public.profiles (
  user_id uuid primary key default auth.uid() references auth.users on delete cascade,
  currency char(3) not null default 'ALL',
  timezone text not null default 'Europe/Tirane',
  rollover_hour smallint not null default 4 check (rollover_hour between 0 and 12),
  updated_at timestamptz not null default now(),
  server_updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- categories
-- ---------------------------------------------------------------------------
create table public.categories (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  name text not null check (length(name) between 1 and 60),
  sort_order integer not null default 0,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  server_updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- items — reusable real-world things ("Red Bull 250ml") with default values
-- ---------------------------------------------------------------------------
create table public.items (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  name text not null check (length(name) between 1 and 120),
  kind text not null check (kind in ('expense', 'income')),
  default_amount numeric(14, 2) check (default_amount is null or default_amount >= 0),
  currency char(3),
  category_id uuid references public.categories on delete set null,
  use_count integer not null default 0,
  last_used_at timestamptz,
  favorite boolean not null default false,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  server_updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- entries — one real-world event; domain data lives in facet tables
-- ---------------------------------------------------------------------------
create table public.entries (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  kind text not null check (kind in ('expense', 'income')),
  occurred_at timestamptz not null,
  local_date date not null,
  item_id uuid references public.items on delete set null,
  title text not null check (length(title) between 1 and 200),
  note text check (note is null or length(note) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  server_updated_at timestamptz not null default now()
);

-- Money facet (1:0..1 with entries). Nutrition, activity… arrive as siblings.
create table public.entry_money (
  entry_id uuid primary key references public.entries on delete cascade,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  direction text not null check (direction in ('out', 'in')),
  amount numeric(14, 2) not null check (amount > 0),
  currency char(3) not null,
  category_id uuid references public.categories on delete set null,
  updated_at timestamptz not null default now(),
  server_updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- targets — versioned; current = latest effective_from <= day
-- ---------------------------------------------------------------------------
create table public.targets (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  key text not null,
  value numeric(14, 2) not null,
  unit text not null,
  effective_from date not null,
  source text not null default 'user' check (source in ('user', 'default', 'analyst')),
  recommendation_id uuid, -- future: Buddy Analyst provenance
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  server_updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Indexes: sync pulls by (user, server time); Today/History by (user, day)
-- ---------------------------------------------------------------------------
create index profiles_sync_idx on public.profiles (server_updated_at);
create index categories_sync_idx on public.categories (user_id, server_updated_at);
create index items_sync_idx on public.items (user_id, server_updated_at);
create index items_category_idx on public.items (category_id);
create index entries_sync_idx on public.entries (user_id, server_updated_at);
create index entries_day_idx on public.entries (user_id, local_date);
create index entries_item_idx on public.entries (item_id);
create index entry_money_sync_idx on public.entry_money (user_id, server_updated_at);
create index entry_money_category_idx on public.entry_money (category_id);
create index targets_sync_idx on public.targets (user_id, server_updated_at);
create index targets_key_idx on public.targets (user_id, key, effective_from);

-- ---------------------------------------------------------------------------
-- Triggers, RLS, grants — the same for every table
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['profiles', 'categories', 'items', 'entries', 'entry_money', 'targets'] loop
    execute format(
      'create trigger %1$s_sync_guard before insert or update on public.%1$I
         for each row execute function public.buddy_sync_guard()', t);
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy %1$s_owner on public.%1$I for all to authenticated
         using (user_id = (select auth.uid()))
         with check (user_id = (select auth.uid()))', t);
    -- No DELETE grant: the app only soft-deletes.
    execute format('grant select, insert, update on public.%I to authenticated', t);
    execute format('revoke all on public.%I from anon', t);
  end loop;
end;
$$;
