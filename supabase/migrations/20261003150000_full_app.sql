-- Buddy schema v2 — body & day, nutrition, training, plan, custom trackers, analyst.
-- Paste into Supabase → SQL Editor → Run (after 20261003120000_init.sql).

-- ---------------------------------------------------------------------------
-- Widen existing tables
-- ---------------------------------------------------------------------------
alter table public.entries drop constraint entries_kind_check;
alter table public.entries add constraint entries_kind_check
  check (kind in ('expense', 'income', 'food', 'sleep', 'weight', 'activity', 'workout', 'custom', 'note'));

alter table public.items drop constraint items_kind_check;
alter table public.items add constraint items_kind_check check (kind in ('expense', 'income', 'food'));

-- ---------------------------------------------------------------------------
-- Foods — nutrition per 100 g / 100 ml; NULL = unknown, never zero
-- ---------------------------------------------------------------------------
create table public.foods (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  name text not null check (length(name) between 1 and 160),
  brand text,
  barcode text,
  basis text not null default '100g' check (basis in ('100g', '100ml')),
  kcal numeric(8, 2),
  protein_g numeric(8, 2),
  carbs_g numeric(8, 2),
  fat_g numeric(8, 2),
  fiber_g numeric(8, 2),
  sugar_g numeric(8, 2),
  sat_fat_g numeric(8, 2),
  sodium_mg numeric(10, 2),
  caffeine_mg numeric(10, 2),
  servings jsonb not null default '[]',      -- [{label, grams}]
  ingredients jsonb,                          -- recipes: [{foodId, grams}]
  source text not null default 'custom' check (source in ('custom', 'off', 'recipe', 'generic')),
  source_id text,
  favorite boolean not null default false,
  use_count integer not null default 0,
  last_used_at timestamptz,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  server_updated_at timestamptz not null default now()
);
create index foods_sync_idx on public.foods (user_id, server_updated_at);
create index foods_barcode_idx on public.foods (user_id, barcode);

alter table public.items add column food_id uuid references public.foods on delete set null;
alter table public.items add column food_grams numeric(10, 2);
alter table public.items add column food_serving_label text;
create index items_food_idx on public.items (food_id);

-- ---------------------------------------------------------------------------
-- Entry facets (1:0..1 with entries)
-- ---------------------------------------------------------------------------
create table public.entry_nutrition (
  entry_id uuid primary key references public.entries on delete cascade,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  food_id uuid references public.foods on delete set null,
  grams numeric(10, 2),
  serving_label text,
  kcal numeric(10, 2),
  protein_g numeric(10, 2),
  carbs_g numeric(10, 2),
  fat_g numeric(10, 2),
  fiber_g numeric(10, 2),
  sugar_g numeric(10, 2),
  sat_fat_g numeric(10, 2),
  sodium_mg numeric(12, 2),
  caffeine_mg numeric(12, 2),
  updated_at timestamptz not null default now(),
  server_updated_at timestamptz not null default now()
);
create index entry_nutrition_food_idx on public.entry_nutrition (food_id);

create table public.entry_sleep (
  entry_id uuid primary key references public.entries on delete cascade,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  bed_at timestamptz,
  wake_at timestamptz,
  duration_min integer not null check (duration_min between 1 and 1440),
  quality smallint check (quality between 1 and 5),
  updated_at timestamptz not null default now(),
  server_updated_at timestamptz not null default now()
);

create table public.entry_measurement (
  entry_id uuid primary key references public.entries on delete cascade,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  metric text not null,
  value numeric(10, 2) not null,
  unit text not null,
  updated_at timestamptz not null default now(),
  server_updated_at timestamptz not null default now()
);

create table public.entry_activity (
  entry_id uuid primary key references public.entries on delete cascade,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  type text not null check (type in ('walk', 'run', 'cycle', 'other')),
  duration_min integer,
  distance_km numeric(8, 2),
  steps integer,
  updated_at timestamptz not null default now(),
  server_updated_at timestamptz not null default now()
);

create table public.workout_templates (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  name text not null check (length(name) between 1 and 80),
  exercises jsonb not null default '[]',      -- [{exerciseId, sets, reps}]
  weekdays jsonb not null default '[]',       -- [0..6], 0 = Sunday
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  server_updated_at timestamptz not null default now()
);
create index workout_templates_sync_idx on public.workout_templates (user_id, server_updated_at);

create table public.entry_workout (
  entry_id uuid primary key references public.entries on delete cascade,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  template_id uuid references public.workout_templates on delete set null,
  started_at timestamptz not null,
  ended_at timestamptz,
  updated_at timestamptz not null default now(),
  server_updated_at timestamptz not null default now()
);
create index entry_workout_template_idx on public.entry_workout (template_id);

create table public.tracker_defs (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  name text not null check (length(name) between 1 and 60),
  fields jsonb not null default '[]',         -- [{key, label, type, unit}]
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  server_updated_at timestamptz not null default now()
);
create index tracker_defs_sync_idx on public.tracker_defs (user_id, server_updated_at);

create table public.entry_custom (
  entry_id uuid primary key references public.entries on delete cascade,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  tracker_id uuid not null references public.tracker_defs on delete cascade,
  "values" jsonb not null default '{}',
  updated_at timestamptz not null default now(),
  server_updated_at timestamptz not null default now()
);
create index entry_custom_tracker_idx on public.entry_custom (tracker_id);

-- ---------------------------------------------------------------------------
-- Training
-- ---------------------------------------------------------------------------
create table public.exercises (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  name text not null check (length(name) between 1 and 80),
  muscle text,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  server_updated_at timestamptz not null default now()
);
create index exercises_sync_idx on public.exercises (user_id, server_updated_at);

create table public.workout_sets (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  entry_id uuid not null references public.entries on delete cascade,
  exercise_id uuid not null references public.exercises on delete restrict,
  exercise_order smallint not null default 0,
  set_index smallint not null default 0,
  reps smallint check (reps is null or reps between 0 and 1000),
  weight_kg numeric(7, 2) check (weight_kg is null or weight_kg >= 0),
  is_warmup boolean not null default false,
  done_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  server_updated_at timestamptz not null default now()
);
create index workout_sets_sync_idx on public.workout_sets (user_id, server_updated_at);
create index workout_sets_entry_idx on public.workout_sets (entry_id);
create index workout_sets_exercise_idx on public.workout_sets (exercise_id);

-- ---------------------------------------------------------------------------
-- Day check-in — one per day; keyed by date so two devices can't duplicate it
-- ---------------------------------------------------------------------------
create table public.day_checkins (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  local_date date not null,
  mood smallint check (mood between 1 and 5),
  energy smallint check (energy between 1 and 5),
  stress smallint check (stress between 1 and 5),
  productivity smallint check (productivity between 1 and 5),
  note text check (note is null or length(note) <= 4000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  server_updated_at timestamptz not null default now(),
  primary key (user_id, local_date)
);
create index day_checkins_sync_idx on public.day_checkins (user_id, server_updated_at);

-- ---------------------------------------------------------------------------
-- Plan
-- ---------------------------------------------------------------------------
create table public.plan_items (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  kind text not null check (kind in ('task', 'routine', 'goal')),
  title text not null check (length(title) between 1 and 200),
  local_date date,
  weekdays jsonb not null default '[]',
  done_dates jsonb not null default '[]',
  done_at timestamptz,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  server_updated_at timestamptz not null default now()
);
create index plan_items_sync_idx on public.plan_items (user_id, server_updated_at);

-- ---------------------------------------------------------------------------
-- Buddy Analyst — imported analyses and the proposals inside them
-- ---------------------------------------------------------------------------
create table public.analyst_runs (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  imported_at timestamptz not null,
  period_from date,
  period_to date,
  analyst_version text,
  model text,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  server_updated_at timestamptz not null default now()
);
create index analyst_runs_sync_idx on public.analyst_runs (user_id, server_updated_at);

create table public.recommendations (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  run_id uuid not null references public.analyst_runs on delete cascade,
  type text not null,
  target_key text not null,
  current_value numeric(14, 2),
  suggested_value numeric(14, 2) not null,
  unit text not null,
  reason text not null,
  confidence text not null check (confidence in ('low', 'medium', 'high')),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'rejected', 'stale')),
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  server_updated_at timestamptz not null default now()
);
create index recommendations_sync_idx on public.recommendations (user_id, server_updated_at);
create index recommendations_run_idx on public.recommendations (run_id);

alter table public.targets
  add constraint targets_recommendation_fk foreign key (recommendation_id)
  references public.recommendations on delete set null;
create index targets_recommendation_idx on public.targets (recommendation_id);

-- ---------------------------------------------------------------------------
-- Facet indexes for sync pulls
-- ---------------------------------------------------------------------------
create index entry_nutrition_sync_idx on public.entry_nutrition (user_id, server_updated_at);
create index entry_sleep_sync_idx on public.entry_sleep (user_id, server_updated_at);
create index entry_measurement_sync_idx on public.entry_measurement (user_id, server_updated_at);
create index entry_activity_sync_idx on public.entry_activity (user_id, server_updated_at);
create index entry_workout_sync_idx on public.entry_workout (user_id, server_updated_at);
create index entry_custom_sync_idx on public.entry_custom (user_id, server_updated_at);

-- ---------------------------------------------------------------------------
-- Triggers, RLS, grants
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'foods', 'entry_nutrition', 'entry_sleep', 'entry_measurement', 'entry_activity',
    'workout_templates', 'entry_workout', 'tracker_defs', 'entry_custom', 'exercises',
    'workout_sets', 'day_checkins', 'plan_items', 'analyst_runs', 'recommendations'
  ] loop
    execute format(
      'create trigger %1$s_sync_guard before insert or update on public.%1$I
         for each row execute function public.buddy_sync_guard()', t);
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy %1$s_owner on public.%1$I for all to authenticated
         using (user_id = (select auth.uid()))
         with check (user_id = (select auth.uid()))', t);
    execute format('grant select, insert, update on public.%I to authenticated', t);
    execute format('revoke all on public.%I from anon', t);
  end loop;
  -- Facets can be removed from an entry (e.g. a price taken off a food), so
  -- the app may delete facet rows. Entries themselves are only soft-deleted.
  foreach t in array array['entry_money', 'entry_nutrition'] loop
    execute format('grant delete on public.%I to authenticated', t);
  end loop;
end;
$$;
