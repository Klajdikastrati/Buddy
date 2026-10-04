# Data model

Rationale: `docs/history/PHASE0_AUDIT_AND_PROPOSAL.md` §9. Types: `src/core/types.ts`. Server: `supabase/migrations/`.

## Core idea
- **Entry** = one real-world event (`occurredAt`, `localDate`, `kind`, `title`, `itemId?`). Domain data are
  **facets**: `money`, `nutrition`, `sleep`, `measurement`, `activity`, `workout`, `custom`. One entry can carry
  several (a bought Red Bull = `kind: 'food'` + nutrition + money). Totals read facets, never `kind`.
- Locally facets are embedded; on the server each is a 1:1 table `entry_<facet>` keyed by `entry_id`.
- **Item** = reusable thing with defaults (`money`, `food: {foodId, grams, servingLabel}`). Logging snapshots
  values into the entry; editing an item/food never rewrites history. Items are created/updated by name on log.
- **Food** = nutrition per 100 g/100 ml; recipes are foods with `ingredients`. Unknown nutrient = `null`, never 0.
- **Target** = versioned (`effectiveFrom`); current = latest row ≤ day. `source` user/default/analyst +
  `recommendationId` give Analyst provenance.
- **DayCheckin** = one per `localDate` (server PK `user_id, local_date`) — mood, energy, stress, productivity, note.

## Tables (local Dexie name → server table)
| Local | Server | Notes |
|---|---|---|
| `entries` | `entries` + `entry_money`, `entry_nutrition`, `entry_sleep`, `entry_measurement`, `entry_activity`, `entry_workout`, `entry_custom` | money/nutrition facet rows deletable |
| `items` | `items` | money defaults + `food_id/food_grams/food_serving_label` |
| `categories` | `categories` | |
| `foods` | `foods` | servings/ingredients JSONB |
| `exercises`, `templates`, `sets` | `exercises`, `workout_templates`, `workout_sets` | sets reference the workout entry |
| `checkins` | `day_checkins` | keyed by date |
| `plan` | `plan_items` | task / routine (`weekdays`, `doneDates`) / goal |
| `trackers` | `tracker_defs` | fields JSONB; values in `entry_custom` |
| `targets` | `targets` | |
| `analystRuns`, `recommendations` | `analyst_runs`, `recommendations` | imported analyses + proposals (type target · plan_item · money_plan · tracker · workout_template; `details` jsonb for non-targets) |
| `moneyPlans` | `money_plans` | money plan: monthly `income`/`bill` (day_of_month), `planned` one-off (date), `balance` anchors (newest wins; balance = anchor + money logged after it). Forecast in `core/forecast.ts` |
| `meta.settings` | `profiles` | currency ALL, timezone, rollover hour |

Every synced row: client UUID (or date key), `createdAt`, `updatedAt` (LWW), `deletedAt` (soft delete).
Server adds `user_id` (default `auth.uid()`, RLS) and `server_updated_at` (pull cursor, set by trigger;
stale writes ignored). JSONB only where data is genuinely variable (servings, template exercises, tracker
fields/values, analyst payload).

## Analyst contracts (JSON files, never database access)
- **Out — `buddy-export-v1-<date>.json`** (`core/export.ts`, Me → Export for Analyst, 30/90/365 days): profile,
  `conventions` (null = not logged), targets (current at period end + history + `proposal_bounds`),
  `interventions` (applied Analyst changes), `daily` (one row per day from `core/series.ts`), entries, foods used,
  workouts with sets, exercises, check-ins, trackers, `data_quality` (missing days, unknown nutrients), `signals`
  (Pearson r, n, 95% CI, ready flag), `analysis_contract` (what an importable analysis may contain).
- **In — `buddy-analysis.json`** (schema_version "1", `core/analyst.ts`): validated strictly; only `target`
  proposals for allow-listed keys within bounds; stored as `analyst_runs` + `recommendations`.
