# Roadmap

## Current: building the whole app (phases 2–8) in one go

Decided 2026-10-03 by the user: build everything now instead of phase-by-phase use. Still commit per phase
(`body:`, `nutrition:`, `training:`, …) with gates green, and test each phase in the browser at 390×844.

### Handoff — state at last commit
**Done**
- Phase 1 app: shell, Quick Add, money logging, Today money block, History, Me, login, sync (see git log).
- Full data model for every phase: `src/core/types.ts`.
- Server schema: `supabase/migrations/20261003120000_init.sql` (**applied** by the user) and
  `20261003150000_full_app.sql` (**written, NOT applied yet** — user pastes it into the SQL Editor).
- Local DB v2 (`src/data/db.ts`): foods, exercises, templates, sets, checkins, plan, trackers, analystRuns,
  recommendations.
- Generic sync: `src/core/sync-map.ts` (`SPECS` registry, entry facets ⇄ facet tables) + `src/data/sync.ts`
  (push in FK order, pull per-table cursors, `entry_money`/`entry_nutrition` rows deleted when a facet is removed).

- Repo writes for every table: `repo-base.ts` (`put`/`save`/`patch`, `rememberItem`, `entryRow`) + `repo-body`,
  `repo-food`, `repo-training`, `repo-plan`, `repo-trackers`, `repo-analyst`. `targetOn` moved to `core/targets.ts`.

**Next, in order**
1. ~~Repo writes for the new tables~~ — done.
2. ~~**Body & day**~~ — done (+ premium design refresh, `/me/targets`, check-in line in History). Spec: Sleep sheet
   (bed/wake → duration, quality), Weight sheet, Activity sheet (walk/run/cycle:
   minutes, km, steps), evening Check-in sheet (mood, energy, stress, productivity, note; one row per day).
   Today blocks: Sleep (last night vs 30-day avg), Weight (latest, Δ vs ~7 days), Activity, check-in prompt
   in the evening if not done. Quick Add gets the new actions.
3. ~~**Nutrition**~~ — done (Food sheet: recents → my foods → OFF search → create; scan + manual barcode;
   servings × count; price → money facet; food editor per 100 or per serving; recipes; `/nutrition`; `/me/foods`).
   Spec: Foods library (per 100 g/ml, servings, `null` = unknown), custom/Albanian foods, recipes
   (food with `ingredients`, nutrients computed), Food sheet (search recents → my foods → Open Food Facts;
   grams or serving; optional price → also a money facet = the Red Bull case), barcode via Open Food Facts
   (`/api/v2/product/{code}.json`, no key). Scanning: iOS Safari has no `BarcodeDetector` → use the
   `barcode-detector` ponyfill, lazy-loaded (justify in ARCHITECTURE.md); manual barcode entry fallback.
   USDA FoodData Central skipped for now (needs an API key). Food items: `item.food` + optional `item.money`;
   `logItem` must log the nutrition facet (TODO in repo.ts). Today: Calories x / target bar + protein.
   `/nutrition` day detail: all nutrients, show "incomplete" when any entry's value is unknown.
4. ~~**Training**~~ — done (templates in `/me/training`, Workout Mode with previous/tap-to-copy/placeholders, resume bar,
   discard + Undo, summary with Δ + PRs, `/training` history + per-exercise e1RM sparkline). Spec: default exercise library seeded after first pull (flag `initialized:exercises`, like
   categories), templates (exercises + sets/reps + weekdays), **Workout Mode** at `/workout` (full screen, no tab
   bar, active workout id in `meta.activeWorkout`, survives reload): previous performance per exercise,
   tap-to-copy last set, ✓ per set, add set/exercise, finish → summary (duration, sets, volume, Δ vs last same
   template, PRs by heaviest weight and Epley e1RM). `/training` history + per-exercise progress.
   Today: "Pull Day · Start" when a template's weekday is today.
5. ~~**Plan**~~ — done (overdue tasks carry over; quick-add for today; routine/goal sheet; Plan tab in the right group). Spec: Plan tab appears: today's tasks (priorities), routines for today (tick → `doneDates`), weekly goals,
   upcoming tasks. Today shows ≤3 priorities.
6. ~~**History & signals + custom trackers**~~ — done (`core/series.ts` daily series shared with export; signals with n, r, 95% CI; trackers in Quick Add + Trends). Spec: History segmented Days | Trends | Signals. Trends: 30-day averages
   vs previous 30 (spend/day, kcal, protein, sleep, weight, workouts/week, km). Signals: Pearson r between daily
   series (sleep→energy/mood same day, caffeine→sleep next night, workout→mood, spend↔mood, weekday vs weekend),
   only when n ≥ 14, always labelled "association, not cause" with n. Custom trackers: define in Me (fields
   number/text/bool + unit), log from Quick Add, show in History.
7. ~~**Analyst export**~~ — done (share sheet or download; contract in DATA_MODEL.md). Spec: Me → Export for Analyst (30/90/365 days) → one `buddy-export-v1.json`: profile, targets
   + history, daily series, entries, foods used, workouts+sets, check-ins, data quality (missing days,
   unknown nutrients), signals. Pure builder in `src/core/export.ts` with tests.
8. ~~**Analyst import**~~ — done (strict validator lists every error with a path; duplicates refused; stale proposals can only be dismissed). Spec: Me → Analyst: pick `buddy-analysis.json`, validate strictly (`src/core/analyst.ts`),
   store run + recommendations; review each proposed change (Current → Suggested · reason · Apply / Keep current).
   Only allow-listed target keys with bounds; mark `stale` if current value differs; Apply writes a target with
   `source='analyst'` + `recommendationId`. Target history list in Me. Insights/warnings read-only. No chat UI.

Routes planned: `/`, `/history`, `/plan`, `/me`, `/nutrition`, `/training`, `/workout`, `/me/foods`,
`/me/training`, `/me/targets`, `/me/trackers`, `/me/analyst`.

### Waiting on the user
- Supabase: create the login user (Auth → Users → Add user, auto-confirm), turn off "Allow new users to sign up".
- Paste `20261003150000_full_app.sql` into the SQL Editor once the next session confirms it's still current.
- Sync has never run against the real database — first sign-in test still owed (Me should say "Synced").
- Deploy: user questioned deploying now; not decided. GitHub push to `Klajdikastrati/Buddy` **not yet approved**.

## Later / deferred
XP/levels/coins/store · AI inside Buddy · onboarding wizard · multi-user · native iOS/HealthKit · bank sync ·
recurring expenses + category budgets (after real use) · water/screen-time/career domains (custom trackers cover them).

## Known issues / notes
- 2026-10-03 — User: the look is "very basic… like a 2010 website", wants a more premium feel. Done mid-session as a
  design-system refresh (see UI_UX.md) before building the remaining screens, so they inherit it.
- Undo of a one-tap log leaves the item's `useCount` incremented (harmless ranking nudge).
- Bundle ~575 KB (supabase-js); precached by the service worker. Consider code-splitting `/workout`, charts, scanner.
