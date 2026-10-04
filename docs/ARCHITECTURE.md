# Architecture

```text
src/core/      pure TypeScript domain logic — no React, no storage. Portable to a future native client.
src/data/      Dexie (IndexedDB) schema, sync, and all writes: repo-base.ts (put + queue helpers),
               repo.ts (settings, money, categories, items, targets), repo-<domain>.ts per domain
src/ui/        hooks + router, Sheet, toast, icons, domain tints, fields, rows, Ring/Bar/Sparkline
src/features/  sheets (one global sheet at a time, `ui/sheets.ts`): Quick Add, money, food (+ scanner, editor,
               recipe), body sheets, workout start/template/summary, plan item, trackers, export
src/screens/   tabs (Today, History, Plan, Me), domain screens (/nutrition, /training, /workout) and /me/* settings
```

## Stack
| Piece | Choice | Why |
|---|---|---|
| App | Vite + React 19 + TS (strict), static SPA | No server in the interaction path; SSR buys nothing for a single-user, auth-only app |
| Local data | Dexie (IndexedDB) + `ui/live.ts` `useLiveQuery` | UI reads/writes locally → instant. Replaces state manager + cache + offline libs. The hook is gated per page (`PageGate`): off-screen tabs keep their last data and stop re-rendering on writes, so a save only re-renders what's visible |
| Navigation | `ui/Pager.tsx` (tabs, stacked in place) + `ui/Stack.tsx` (pushed screens) | All tab screens stay mounted (memoised) → instant switches, kept scroll; hand-rolled pointer gestures, no gesture lib |
| Cloud | Supabase (Postgres, Auth, RLS), region eu-central-1 | Source of truth + sync; RLS is the security boundary |
| Offline shell | vite-plugin-pwa (Workbox `generateSW`) | App opens from disk, works offline |
| Tests | Vitest — pure `core/` logic only | |
| Router | ~20-line pathname router in `ui/hooks.ts` + a route table in `App.tsx` | Flat paths, no params — no library needed |

No UI kit, no icon lib, no chart lib, no state lib. Adding a significant dependency needs a demonstrated problem.
Assets: Inter variable font, Latin subset (`public/fonts`, 48 KB, OFL, precached) — only used where SF Pro isn't
available, so the app looks the same on a Windows/Android browser as on the iPhone.

| Added dependency | Why |
|---|---|
| `barcode-detector` (ZXing WASM ponyfill) | iOS Safari has no `BarcodeDetector`; scanning food barcodes is a Phase 3 requirement. Lazy-loaded with the scanner (`React.lazy`), native API used when present, `.wasm` (1.1 MB) served from our origin on first scan — not precached, never a CDN. |

## External services
- **Open Food Facts** (no key, CORS `*`): `api/v2/product/{code}.json` for barcodes; `cgi/search.pl` for text search
  (often overloaded → 503 without CORS headers → retried 3×, then "search failed" with create/scan fallbacks).
  `search.openfoodfacts.org` sends no CORS headers, so it can't be used from the browser. Called only on an explicit
  search/scan; a result is stored as a food only when logged. Mapping + sanity bounds in `core/off.ts`.
- **Built-in common foods** (`core/foodbase.ts`, ~140 items, USDA reference values per 100 g/ml; Albanian dishes
  are flagged estimates; English + Albanian names, accents optional). Searched offline before anything online —
  OFF text search is unreliable and weak on unpackaged food. Saved to My foods (source `generic`) when first logged.

## Data flow
1. Screen reads Dexie via `useLiveQuery` (re-renders on any local change).
2. Writes go through `data/repo*.ts` only: write row(s) locally + append `{table,rowId}` to `outbox`, in one
   transaction (`put`/`save`/`patch` in `repo-base.ts`). Pure calculations live in `core/` and are unit-tested.
3. (Phase 1b) Sync: push outbox → Supabase `upsert` by client UUID (idempotent); pull rows with
   `updated_at > cursor`. Last-write-wins (single user). Soft deletes (`deletedAt`) sync like any update.

## Conventions
- Client-generated UUIDs (`core/uid.ts`) on every row; every row has `createdAt/updatedAt/deletedAt`.
- Dates: `localDate` computed once at write time via `localDateOf(instant, tz, rolloverHour)`.
- Currency default `ALL` (Lek). Amounts stored as numbers in the entry's currency.
- Server components, server actions, API routes: none. If server code is ever needed, a Supabase Edge Function.
