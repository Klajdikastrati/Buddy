-- Buddy — habits (2026-10-04). Paste into the Supabase SQL Editor and Run once.
-- Routines become habits: how many times a day, when in the day, and the cue
-- they follow ("after I wake up"). Safe to run on existing data (defaults).

alter table public.plan_items
  add column if not exists times_per_day smallint not null default 1
    check (times_per_day between 1 and 10),
  add column if not exists part_of_day text not null default 'anytime'
    check (part_of_day in ('morning', 'afternoon', 'evening', 'anytime')),
  add column if not exists cue text
    check (cue is null or length(cue) between 1 and 120);
