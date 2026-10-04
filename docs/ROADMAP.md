# Roadmap

## Current: phases 1–8 built — next is real use on the phone

All of Phase 0's roadmap is implemented (2026-10-03, one commit per phase, gates green, each phase tested in the
browser at 390×844 with test data). Nothing has run against the real database yet.

### Handoff — state at last commit
**Built** (see git log `data:` … `analyst:` for detail)
- Money, Body & day (sleep, weight, activity, check-in), Nutrition (foods, recipes, Open Food Facts search +
  barcode scan, price → money facet), Training (templates, Workout Mode, PRs, history), Plan (tasks, routines,
  weekly goals, Today priorities), History (Days | Trends | Signals), custom trackers, Analyst export + import.
- Premium visual refresh (UI_UX.md "premium calm"); + centred in the tab bar (left group · + · right group).
- After the user's first look: compact Today (all numbers above the fold) and Instagram-style navigation —
  swipeable tab pager, pushed screens with edge-swipe back, draggable sheets, per-page gated live data.
- Money planner (2026-10-04): Money dashboard opens with Balance now, free per day until payday, balance-ahead
  line, Coming up (31 days) and the Money plan (bills, income, planned spends); "Paid — log it now" on a plan row.
- Workout Mode: swap an exercise in place (unticked sets move to the new one).
- Analyst can propose money plan rows, trackers and workout templates (validated, approved one by one); the export
  carries `money_plan` (rows + forecast) and `workout_templates`.
- Pure logic in `src/core/*` with 72 Vitest tests; writes in `src/data/repo-*.ts`; one daily series
  (`core/series.ts`) feeds Trends, Signals and the export.

**Next**
1. User applies the migration and creates the login user (below), then first real sign-in + sync test.
2. Deploy (needs approval) → install to Home Screen → use daily for a week; test camera scanning on the iPhone.
3. Collect friction, then one design/feel pass with the user (screenshots in hand).

### Waiting on the user
- Supabase: paste `supabase/migrations/20261003150000_full_app.sql` into the SQL Editor — **checked 2026-10-03:
  still current** (no type/sync changes since it was written; 2026-10-03 later: `foods.source` now also allows
  `'generic'`, and `recommendations` gained `details` jsonb + nullable target columns for plan proposals;
  2026-10-04: new `money_plans` table and more recommendation types — edited in place since the file was never
  applied). Until it's applied, every push fails (new tables
  and entry kinds don't exist on the server), so local logging works but nothing syncs.
- Supabase: login user **created by the user (2026-10-04)**. Still check "Allow new users to sign up" is off.
- Deploy: not decided (any static host; needs HTTPS for the PWA and the camera). GitHub push to
  `Klajdikastrati/Buddy` **not yet approved**.

Routes (all built): `/`, `/history`, `/plan`, `/me`, `/nutrition`, `/training`, `/workout`, `/me/foods`,
`/me/training`, `/me/targets`, `/me/trackers`, `/me/analyst`.

## Later / deferred
XP/levels/coins/store · AI inside Buddy · onboarding wizard · multi-user · native iOS/HealthKit · bank sync ·
category budgets (after real use) · multi-currency (salary in EUR is entered converted to Lek) · water/screen-time/career domains (custom trackers cover them).

## Known issues / notes
- Open Food Facts text search is often overloaded (503 without CORS); retried 3×, then the sheet offers scan/create.
- Barcode camera untested on a real iPhone (headless browser has no camera); ZXing decoding verified on a drawn
  EAN-13 and manual entry works.
- Workout Mode: no rest timer, warm-up flag not settable in the UI. Analyst "Apply" has no Undo (edit the target
  in Me → Targets). Sleep "last night" includes naps logged that day.
- Lint warnings only (`Date.now()` during render in a few sheets) — harmless.
- Motion measured in dev only (StrictMode, unminified): pushed screens fill in ~55 ms, Workout Mode's rows
  ~0.2–0.4 s behind an instant placeholder frame. Re-check on the iPhone with a production build.
- 2026-10-03 — User: the look is "very basic… like a 2010 website", wants a more premium feel. Done mid-session as a
  design-system refresh (see UI_UX.md) before building the remaining screens, so they inherit it.
- Undo of a one-tap log leaves the item's `useCount` incremented (harmless ranking nudge).
- Bundle ~640 KB JS / 185 KB gzip (supabase-js is most of it); scanner + ZXing already split out (wasm not
  precached). Consider splitting `/workout` and History insights if cold start gets slow.
