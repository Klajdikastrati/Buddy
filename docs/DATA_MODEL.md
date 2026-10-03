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
| `analystRuns`, `recommendations` | `analyst_runs`, `recommendations` | imported analyses + proposals |
| `meta.settings` | `profiles` | currency ALL, timezone, rollover hour |

Every synced row: client UUID (or date key), `createdAt`, `updatedAt` (LWW), `deletedAt` (soft delete).
Server adds `user_id` (default `auth.uid()`, RLS) and `server_updated_at` (pull cursor, set by trigger;
stale writes ignored). JSONB only where data is genuinely variable (servings, template exercises, tracker
fields/values, analyst payload).
