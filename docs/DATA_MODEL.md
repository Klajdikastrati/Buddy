# Data model

Full rationale: `docs/history/PHASE0_AUDIT_AND_PROPOSAL.md` §9. This file tracks what exists.

## Core idea
- **Entry** = one real-world event (`occurredAt`, `localDate`, `kind`, `title`, `itemId?`). Domain data are **facets**.
  Locally facets are embedded (`entry.money`); on the server each facet is a 1:1 table keyed by `entry_id`.
- **Item** = a reusable real-world thing with default facet values. Logging copies (snapshots) values into the entry;
  editing an item never rewrites history. Items are created/updated automatically by name when you log.
- **Target** = versioned (`effectiveFrom`); current value = latest row ≤ the day. Foundation for Analyst history.
- Unknown = `null`, never 0.

## Implemented (local, Dexie v1)
| Table | Key fields |
|---|---|
| `entries` | id, kind (`expense`/`income`), occurredAt, localDate, itemId, title, note, money{direction, amount, currency, categoryId} |
| `items` | id, name, kind, money{amount, currency, categoryId}, useCount, lastUsedAt, favorite, archived |
| `categories` | id, name, sortOrder, archived |
| `targets` | id, key (`budget_month`), value, unit, effectiveFrom, source (`user`/`default`/`analyst`) |
| `outbox` | seq, table, rowId — pending uploads |
| `meta` | key/value: `settings` {currency, timezone, rolloverHour}, `initialized` |

All synced rows: `createdAt`, `updatedAt`, `deletedAt` (soft delete).

## Planned server schema (Phase 1b, Supabase)
`profiles`, `entries`, `entry_money`, `items`, `categories`, `targets` — RLS `user_id = auth.uid()` on all,
index `(user_id, local_date)` on entries, `(user_id, updated_at)` on every table for sync pulls.

Later facets: `entry_nutrition` (per-entry snapshot; core macros as columns, micros JSONB), `entry_activity`,
`entry_measurement`, `sleep`, `day_checkins`, `foods`, `recipes`, `workouts`/`workout_sets`/templates,
`plan_items`, `tracker_defs`/`entry_custom`, `analyst_runs`/`recommendations`.
