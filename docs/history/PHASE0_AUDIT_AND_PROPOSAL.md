# Phase 0 — LevelUp Audit & Buddy Proposal

Date: 2026-10-03 · Scope: read-only audit of `Desktop/LevelUP` (branch `pivot-v2`, 87 commits, clean tree).
Nothing in LevelUp, its database, or Supabase was modified.

**Evidence limits.** LevelUp's Supabase project (`bmqywxrcpednaabhlgmv`, eu-west-1) no longer resolves in DNS — it was
almost certainly auto-paused after ~4 weeks idle. Live DB inspection and live performance traces were therefore not
possible. Performance conclusions below come from (a) source tracing of every request path, (b) the measurements already
recorded in LevelUp's own `AUDIT.md` (2026-09-05, Chrome DevTools, localhost), and (c) infrastructure config. Items that
need a live check are marked **INVESTIGATE**.

---

## 1. Executive summary

**What LevelUp is.** A Next.js 16 + Supabase + Drizzle "personal life OS": ~31k lines of TS/TSX, ~25 domain tables,
16 log types, 5 analytics domains with 7 chart drill-downs, an 8-step onboarding wizard, and a game layer (habits → XP
→ levels → coins → reward store).

**What it tried to do — twice.**
- **v1 (Aug 30 – Sep 1):** write a free-text diary → an LLM extracts structured facts → you confirm/correct → a 0–100
  daily score + XP + AI remarks.
- **v2 pivot (Sep 2 – Sep 6):** rip out AI and scoring (‑18k lines), replace with a quick-entry grid, a tiered habit
  checklist paying XP, coins minted on level-up, and a store of self-defined rewards.

**The single most important finding: LevelUp was built, not used.** The whole system — AI pipeline, scoring, XP engine,
full pivot, economy, onboarding, analytics — was written in **6 working days** (14+14+5+22+23+9 commits). The docs say
the live login and the on-device pass were still "owed"; the only income row is seed data. Every chart was validated
against *seeded* data. There was never a feedback loop from real use, so nothing told the project it was drifting.

**Where it diverged from Buddy's goals.**
| Buddy wants | LevelUp did |
|---|---|
| A logger first | A game first: 2 of 5 tabs (Store, Character) and the whole Today screen are the XP economy |
| "How is today going?" | Today = a habit checklist with a level ring and coin balance; no sleep, food, spend |
| Log once, update everything | Expense and meal are separate tables and separate forms — a Red Bull is logged twice |
| Never enter what's known | Habits like "Log every meal", "Hit 10k steps" are manual ticks duplicating logged facts |
| Gets faster with use | No recents, no repeat, no favourites, no "same as last time" anywhere in logging |
| Unknown ≠ zero | Nutrition math coerces null → 0; food profiles mix per-unit kcal with per-portion macros |
| Feels instant | Every tap is a server render from (likely) a US function to an Irish DB; every save waits + re-renders the page |
| Simple to build/maintain | ~260 KB of planning docs, 6 custom agents, 15 design skills, a design-lint hook on every edit |

**Major conclusions.**
1. Do not port LevelUp's architecture. Its slowness is structural (server-rendered, server-awaited everything), not a
   missing optimisation.
2. Delete the game layer entirely for V1. It consumed most of the product surface and most of the bugs in the prior
   audit (double-spend, XP farms, mint/undo asymmetry, week-boundary bugs) without ever being used.
3. Keep a handful of *ideas* (date rollover, append-only discipline, workout-set shape, hand-rolled SVG charts, mobile
   CSS hygiene). Very little *code* is worth copying.
4. Buddy's core data primitive should be a **real-world entry with optional domain facets** plus **reusable items** —
   the thing LevelUp never had.
5. Buddy should be **local-first**: the phone reads and writes a local database instantly; Supabase is the sync target
   and source of truth, not something the UI waits on.
6. The development process must be part of the fix: tiny docs, no agent/skill zoo, vertical slices you can use within
   days, and real use before the next phase starts.

---

## 2. Feature inventory

Verdicts: **KEEP** (concept + approach) · **MODIFY** (concept yes, implementation no) · **REPLACE** (need exists, solve
differently) · **DELETE** · **INVESTIGATE**.

| Feature | What it does / how | Verdict | Reasoning |
|---|---|---|---|
| Auth (magic link + password, `ALLOWED_EMAIL` allowlist in proxy) | Supabase SSR cookies, `getClaims()` in proxy + every page/action | **REPLACE** | Need auth, but a client-side Supabase session + RLS is simpler and removes per-navigation auth round-trips. Allowlist idea is fine for V1. |
| `daily_logs` per-day container | Every fact FK's to a day row; `findOrCreateQuickLog` before every write | **DELETE** | Artifact of the AI-diary design. Forces an extra write + joins; dates belong on the entry itself. |
| Day rollover hour + timezone (`resolveLogDate`) | "2 a.m. still counts as yesterday", DST-safe | **KEEP** (idea + likely the function) | Genuinely needed for a logger; small, tested, pure. |
| Today = habit checklist + level ring + coins + streak | `force-dynamic` RSC, 7 parallel reads | **REPLACE** | Wrong question answered. Buddy Today = day status across domains. |
| `/log` 16-tile grid → per-type sheets | Server action per type, waits, revalidates `/log` + `/today` | **REPLACE** | 16 equal choices, no recents/repeat, server-awaited. → Quick Add with recents + items. |
| Back-dated logging w/ swipe day-nav | `/log?date=` | **MODIFY** | Editing past days is needed; swipe-only nav isn't (keep tap alternatives). |
| Delete + undo toast | Snapshot round-trips through the client → `restoreEntry` (trusts client row — audit M5) | **MODIFY** | Undo is right; use soft-delete (`deleted_at`) instead of snapshot restore. |
| Meal logging / `food_profiles` library | Pick food + qty; kcal per unit, macros per default portion; manual "custom" line | **REPLACE** | Mixed bases caused a real bug (seed meals 2% of true kcal). No per-100g, no source, no barcode, no micros, unknown→0. |
| Expense logging + categories | `expenses` with fx fields, category aliases (AI-era) | **MODIFY** | Shape mostly fine; default currency EUR (you use Lek); must become a facet of an entry, not a silo. |
| Income + recurring expenses | Added late; recurring has `next_due_on` but nothing posts them | **MODIFY** | Needed in Finance phase; design recurring properly (template → generated entries). |
| Workout logging | After-the-fact form: type, exercises, sets; no previous performance, no templates, no live mode | **REPLACE** | Buddy needs a live workout mode. Set-level schema shape is reusable. |
| PR detection | Added post-audit on workout save | **MODIFY** | Real progress is the point; compute deterministically from sets. |
| Cardio sessions | Type, minutes, distance, avg HR | **MODIFY** | Fold into activity entries. |
| Sleep, weight, steps | Separate sheets, separate tables | **MODIFY** | Keep the data; sleep should be bed/wake times with derived duration. |
| Water | Chip-tap rows | **DELETE** (→ custom tracker if wanted) | Not in Buddy's list; adds a Today metric competing for attention. |
| Mood / energy / stress | 1–5 sheet | **KEEP** (concept) | Belongs in the evening check-in or a one-tap Quick Add. |
| Journal / social / screen-time / reading / work / learning / career (projects, skills) | 7 more log types + `/life/mind`, `/life/career` | **DELETE** for V1 | Scope creep; none are in Buddy's core list. Reading/alcohol-style things → custom trackers later. |
| Custom metrics (define in Settings, log tile) | `custom_metrics` + `metric_values` | **MODIFY** | Right idea, add later with a small fixed field-type set. |
| `/life` body-map hub | SVG figure → tap a body part to reach a domain | **DELETE** | Decorative extra tap; a metaphor you must decode. |
| `/life/*` domain dashboards + 7 metric drill-downs | Server-side aggregation libs, range toolbar, hand-rolled SVG charts | **MODIFY** | Progressive disclosure is right; 5 hubs + 7 detail pages + duplicated range toolbars is too much. Charts code is reusable. |
| `/history` XP calendar heatmap | Sum of task XP per day | **REPLACE** | History should be "what happened on that day", not XP. |
| XP, levels, coins, store, rewards, `xp_transactions`, `v_coin_balance`, task tiers | Full ledger economy with append-only triggers | **DELETE** | Brief §17. Was the largest surface, the source of most audited bugs, never used. |
| `/character` | Level ring, lifetime XP, coin history | **DELETE** | Game-only screen. |
| `/tasks` habit/reward library | CRUD for tiered XP tasks + rewards | **REPLACE** | Planning-lite (priorities, routines) without XP. |
| Onboarding (8 steps: identity, health, finance, motivation, goals, generated tasks, generated rewards, confirm) | Mifflin–St Jeor targets, template-generated task/reward lists | **DELETE** the wizard; **KEEP** the target formula | Brief §26: no giant setup. Sensible defaults, configure when first relevant (e.g. ask calorie target the first time you open Nutrition). |
| Goals (`goals` table) | Created in onboarding, never updated | **REPLACE** | → versioned targets (also the foundation for Analyst recommendation history). |
| Settings (rollover, tz, currency, locale + profile/targets/money/metrics forms) | Many forms added after the audit | **MODIFY** | Keep small; lives under Me. |
| Weekly review card, rolling consistency % | Deterministic summaries | **KEEP** (idea) | Fits "evidence, not judgement". Later phase. |
| AI extraction, scoring, remarks, provenance (v1) | Already deleted in v2 | **DELETE** (stay deleted) | Brief §38: no AI in Buddy's operation. Note: v1's *structured provenance* idea returns properly as Analyst provenance (§47). |
| PWA manifest, icons | Manifest only, no service worker, no offline | **MODIFY** | Need a real service worker + local data for app-like startup. |
| Seed script (1,000 lines) | Synthetic 30-day history | **DELETE** | Seed data hid the "never used" problem. Buddy fills with real data from day one; a tiny fixture set for tests only. |
| Vitest suites (189 tests, many hitting the live DB in rollback txns) | | **MODIFY** | Unit-test pure logic (dates, nutrition math, aggregates); don't make tests depend on a live cloud DB. |

---

## 3. UX audit

**Cognitive overload**
- Five tabs, of which two (Store, Character) serve the game; three more destinations (Library, Past days, Settings)
  hidden behind icons. The prior audit found core tasks (change a target, add a habit, see a past day) undiscoverable.
- `/log` presents 16 equally-weighted tiles. The most frequent action (a coffee, a familiar meal) costs the same as the
  rarest (screen-time). No recents, no defaults, no "repeat".
- Today shows level, XP-into-level, coins, coins-at-next-level, streak, 7/30/90 consistency, and a tiered checklist —
  ~8 numbers about the *game*, zero about sleep/food/money.
- `/life` requires decoding a body-map metaphor before reaching data.

**Logging friction / duplicated effort**
- A purchase that is also food is two forms (Expense + Meal), two category decisions, two saves.
- Self-reported habits duplicate measured data ("Log every meal", "Hit 10,000 steps", "Drink 2 L water"). The prior audit
  observed all 14 habits ticked while `/log` said "Nothing logged yet" — the system invited you to report on your own data.
- Meals: open sheet → pick meal type → open picker → search → pick → adjust qty → (repeat per food) → save → wait.
  No saved meals, no "same as yesterday's breakfast".
- Workout: logged as one big form after the fact, no previous numbers, no templates.

**Excessive configuration / software management**
- An 8-step onboarding asking for net worth, debts, "what drives you", reward desirability, before you can log anything.
- Tiered XP bands, reward pricing, cooldowns, habit cadences — a whole economy to tune. This is exactly "another system to
  maintain".

**Poor hierarchy / distracting features**
- Gamification sits above real data everywhere it appears.
- Copy leans marketing: "One figure, every domain — A person carrying their whole life", level titles, "Player".
- Empty-vs-zero conflated (`€0` for "nothing logged").

**What Buddy simplifies:** one Quick Add with recents on top; items that log multi-domain facts in one tap; Today shows
4–6 real metrics; depth only on tap; configuration appears the first time it's needed, never up front.

---

## 4. Performance audit — why LevelUp felt slow

### 4.1 The request path for one tab tap (traced from source)

Tapping a tab (e.g. Today) in production does:

```text
phone (Tirana) ──► Vercel edge ──► proxy.ts: supabase.auth.getClaims()        [1]
                                   ──► (app)/layout.tsx: requireOnboarded()
                                         requireUser() → getClaims()          [2]
                                         SELECT user_profile                  [DB #1]
                                   ──► today/page.tsx: requireUser() → getClaims() [3]
                                         getSettings(): requireUser() → getClaims() [4]
                                            INSERT app_settings ON CONFLICT DO NOTHING  [DB #2 — a write on every read]
                                            SELECT app_settings                           [DB #3]
                                         getTodayData(): 7 queries in Promise.all       [DB #4]
                                            (2 of them aggregate views over all history)
                                   ◄── full RSC payload for the page
```

Page-level DB work is **3 sequential round-trips** (settings insert → settings select → data batch), plus the layout's
profile read, plus up to **4 `getClaims()` calls**. Every route is `force-dynamic`, so nothing is cached or prefetchable.

### 4.2 Root causes, ranked

| # | Cause | Evidence | Impact |
|---|---|---|---|
| 1 | **Server-rendered, server-awaited UI for every interaction.** All routes `force-dynamic`; no `loading.tsx` (until late); no client cache; `<Link>` prefetch delivers nothing for dynamic routes. | `export const dynamic = "force-dynamic"` on every page; prior audit: "no `_rsc` prefetch fires on idle". | Each tap = full server render. Measured on **localhost, no throttling**: 298–483 ms of frozen screen per tab; cold `/today` TTFB 766 ms. Real network multiplies this. |
| 2 | **Likely cross-Atlantic function↔DB placement.** DB is `aws-1-eu-west-1` (Dublin). No `vercel.json` / region config → Vercel functions default to **iad1 (Washington DC)**. | `.env.local` pooler host; no `vercel.json`, no `.vercel/`. | **INVESTIGATE** in the Vercel dashboard (Settings → Functions → Region). If iad1: ~70–80 ms per DB round-trip × ≥4 sequential round-trips per page ≈ 300+ ms of pure transatlantic latency, *plus* Tirana→US for the request itself. This is the most plausible reason *all* your Supabase+Vercel projects felt slow. |
| 3 | **Writes wait for the server, then re-render the whole page.** Every `/log` save: `requireUser` → `findOrCreateQuickLog` (select/insert) → insert → `revalidatePath('/log')` + `('/today')` + `revalidateTag` → the action response re-runs `/log`'s ~15 queries. | `app/(app)/log/actions.ts:61-64`; 21 save actions; only `/today` toggle and redeem are optimistic. | Exactly the "bad" flow in brief §33. Saving a coffee costs several round-trips before the sheet closes. |
| 4 | **Redundant auth + a write on every read.** `getClaims()` up to 4×/navigation; `getSettings()` does `INSERT … ON CONFLICT` every render. | `lib/settings.ts:21-30`, `lib/auth/*`, `lib/supabase/proxy.ts`. | `getClaims()` is local only with asymmetric JWT keys; with legacy HS256 keys it calls the Auth server each time (**INVESTIGATE** key type when project is restored). The settings upsert is a guaranteed extra write round-trip per page. |
| 5 | **Serverless DB connections.** `postgres-js` via the transaction pooler; cold function instances must open a TLS connection to the pooler before the first query. | `db/client.ts`. | Adds ~3 RTT on cold starts; with a single user, most visits are cold. |
| 6 | **Dev-mode experience on a OneDrive folder.** You vibe-coded against `next dev`, which compiles each route on first visit; the project lives in a OneDrive-synced folder (the code itself notes the file-backed cache is slower than re-querying there). | `lib/analytics-cache.ts` comment; path `OneDrive\Desktop\LevelUP`. | Explains a lot of the *felt* slowness during development (multi-second first navigations). Buddy's repo should live outside OneDrive. |
| 7 | **Aggregations computed on read.** `/today` level/balance come from views summing all history; `/life/*` recompute ranges each visit (`unstable_cache` added late, prod-only, 5-min TTL, busted by every write). | `lib/game/balance.ts`, `lib/analytics-cache.ts`. | Small at current scale; architectural smell. |
| 8 | **No offline / no local data.** No service worker, no IndexedDB. | Grep: zero `serviceWorker`/`indexedDB` in app code. | On a weak mobile connection, the app can't show anything without the server. |

**Not the problem:** query plans (indexed, sub-ms per the prior `EXPLAIN`), bundle size (hand-rolled SVG charts, no chart
library), CLS (0.00), animations (short, reduced-motion respected).

**Verdict:** LevelUp felt slow because the architecture placed a network round-trip — probably a transatlantic one —
between every tap and every pixel. Optimising queries would not have fixed it. Buddy must remove the server from the
interaction path.

**If you want hard numbers before Phase 1** (optional): restore the paused LevelUp project in the Supabase dashboard and
tell me the deployed URL; I'll run a Playwright trace on a throttled 4G mobile profile and confirm the region + JWT key
type. Not required to proceed — Buddy's architecture removes these causes regardless.

---

## 5. Architecture audit

| Area | Finding | Assessment |
|---|---|---|
| Framework | Next.js 16 App Router, RSC everywhere, server actions for all writes. `AGENTS.md` opens with "This is NOT the Next.js you know" — every session had to read framework docs first. | Wrong tool for a single-user, auth-only, interaction-heavy app. SSR buys nothing (no SEO, no public pages) and costs latency + complexity. |
| State | Server is the state; client re-fetches via RSC refresh. `useOptimistic` only on `/today` toggle and redeem. | No client data layer → nothing can be instant. |
| DB access | Drizzle connects as table owner → **RLS bypassed**; the security boundary is hand-written `requireUser()` in every action. Prior audit found one action trusting a client-supplied row (`restoreEntry`). | Fragile. Buddy: RLS is the boundary, enforced by Postgres. |
| Schema | ~25 domain tables + game ledger; everything hangs off `daily_logs`; GIN alias indexes + `is_confirmed` flags left from AI extraction; 15 unused indexes, 43 unindexed FKs (advisor). Docs: `SCHEMA.md` 95 KB, `M4-PLAN.md` 57 KB. | Over-built for features never used, under-built for the cross-domain case. |
| Business logic | `lib/{finance,health,training,mind,career}` aggregation libs + tests — clean, pure-ish, but server-only and coupled to Drizzle. | Patterns are fine; code is tied to the wrong runtime. |
| Validation | Hand-rolled per action; zod installed but barely used. | Pick one approach. |
| Dependencies | Lean: no chart lib, no state lib. `radix-ui` + `shadcn` + `cmdk` + `sonner` + `next-themes`. | Good instinct worth keeping. |
| Tooling / process | 6 custom subagents, 15 skills (impeccable ~1 MB of scripts, tastemaker, animate…), PostToolUse hook on every Edit + Stop hook "design deep pass". Supabase PAT expiring. | A major hidden cost: tokens, time, and cognitive load per change. **Do not bring this to Buddy.** |
| Migrations | 11 Drizzle migrations incl. hand-patched teardown SQL; user must run `db:migrate` manually. | Workable; simpler with Supabase CLI SQL migrations + generated types. |

**Future-scaling problems if continued:** every new domain = new table + new sheet + new action + new aggregation lib +
new screen; cross-domain events impossible without restructuring; nothing works offline; a native client couldn't reuse
the logic (it lives in server actions).

---

## 6. Reusable assets (non-sentimental)

| Asset | Reuse? | How |
|---|---|---|
| `lib/date/log-date.ts`, `lib/date/iso.ts` (+ tests) | **Copy** | Rollover/timezone date resolution. Small, pure, tested. |
| `lib/health/targets.ts` (Mifflin–St Jeor + activity + rate) | **Copy** | Default calorie/macro targets, editable. |
| Workout set shape (`exercise_id, set_index, reps, weight_kg, rpe, is_warmup`) + PR index idea | **Concept** | Rewrite in the new schema. |
| `lib/training/prs.ts`, `muscle-balance.ts` logic | **Concept** | Re-derive against the new model. |
| Hand-rolled SVG charts (`trend-chart`, `stacked-bar-chart`, `multi-line-chart`) | **Maybe later** | Evaluate in the History phase; they're good but Next/RSC-shaped. |
| Mobile CSS hygiene: `100dvh`, safe-area vars, ≥16px inputs, ≥44px targets, `touch-action`, reduced-motion | **Concept** | Carry the rules into `UI_UX.md`. |
| `use-visual-viewport-inset.ts` (keyboard-aware sheets) | **Copy if needed** | Solves "keyboard covers the action" on iOS. |
| Design tokens (near-black ground, one accent, Geist + mono numerals, tabular nums) | **Concept** | Close to Buddy's direction; re-derive, calmer. |
| `uid()` (no `crypto.randomUUID` off secure context) | **Copy** | Needed for client-generated IDs. |
| Append-only / undo thinking | **Concept** | Becomes soft-delete + `updated_at` sync. |
| Everything game-related, onboarding, seed, `/life` hub, body-map, store, character, AI-era leftovers | **Leave behind** | |

Rough estimate: **< 3%** of LevelUp's code is worth copying. That is fine — the real value is the lessons.

---

## 7. Buddy product proposal

**Buddy is a fast, local-first, mobile PWA that captures real-world events once and derives everything else.**

- **Logger first.** The primary verb is *log*, optimised for the 500th repetition: recents, items, repeat, defaults.
- **One event, many facets.** "Red Bull, 180 L" is one entry carrying money + nutrition facets; finance and nutrition
  totals both update.
- **Today answers "how is today going"** with ~5 real numbers vs your own averages/targets. No judgement words.
- **Depth on demand.** Tap a number for its domain detail; configuration lives under Me.
- **Real progress, not points.** PRs, volume trends, sleep averages, savings vs last month.
- **Deterministic first.** Totals, averages, trends, simple correlations computed in code. No AI in normal operation.
- **Export for Buddy Analyst**; later, import structured proposals you approve one by one.
- **Success = still opened daily in April 2027.**

**Not:** a game, a coach, a chatbot, a Notion clone, a habit-streak app, a SaaS dashboard.

---

## 8. Information architecture

**Navigation (4 tabs + centre action):**

```text
 Today    History    [ + ]    Plan    Me
```

| Destination | Contents |
|---|---|
| **Today** | Date · Sleep · Calories (+protein) · Money today / month remaining · Activity · Today's workout (Start →) · Priorities (≤3) · Evening check-in prompt after ~20:00 · Today's entries list (tap to edit). Each block taps through to its domain detail. |
| **[ + ] Quick Add** | Bottom sheet, opens instantly. Top: recent/frequent items (one tap = logged with defaults, undo toast). Then action row: Expense · Food · Workout · Weight · Mood · Note · (custom trackers). Search box doubles as "find item / food / create new". |
| **History** | Day list / calendar → any day's entries (edit). Domain views: Nutrition · Money · Training · Body & Sleep — trends, averages, comparisons. Correlation signals later (Phase 6). |
| **Plan** | Today's priorities, recurring routines, workout schedule, weekly goals, upcoming. Lightweight; no tiers, no points. |
| **Me** | Targets (versioned) · Items & foods library · Categories & budgets · Workout templates & exercises · Quick Add customisation · Custom trackers · Export (Analyst) · Settings (currency ALL, timezone, rollover hour) · later: Analyst suggestions. |

**Domain detail screens** (reached from Today/History, not tabs): Nutrition day/week, Money month, Training log/exercise
history, Body (weight/sleep).

**Workout Mode**: full-screen takeover started from Today/Plan/Quick Add; no tab bar; persists across app restarts.

**Key flows:**
1. *Repeat purchase:* `+` → tap "Red Bull" → done (1–2 taps). Expense + nutrition updated; undo toast.
2. *New local food:* `+` → Food → search "byrek" → not found → "Create" (name, serving, kcal, macros as known; unknown
   left blank) → logged and saved as an item.
3. *Barcode (Phase 3):* Food → scan → Open Food Facts → confirm serving → logged; price optional → becomes an item.
4. *Workout:* Today "Pull Day → Start" → exercise with previous numbers → tap set to prefill last weight×reps → ✓ → next →
   Finish → summary (duration, sets, volume, Δ vs last, PRs).
5. *Evening check-in:* Today prompt → mood, energy, one note (≤30 s). Never asks about logged things.
6. *Sleep:* morning one-tap "Woke up" (bedtime remembered from "Going to bed" tap or typical default) + quality.

---

## 9. Data architecture

### 9.1 Principles
- **Entry = a real-world event** with `occurred_at` + `local_date` (rollover-aware). Domain data lives in **facet** tables
  (1:0..1 per entry). One event → many domains, no duplication.
- **Items = reusable templates** of real-world things (a Red Bull, a coffee, "chicken meal at X", a bus ticket) carrying
  default facet values. Logging an item snapshots its values into the entry (history never changes when you edit the item).
- **Unknown is NULL.** Never coerce. Store nutrition source + completeness.
- **Client-generated UUIDs, `updated_at`, `deleted_at`** on every user row → simple sync + undo.
- **RLS on every table** (`user_id = auth.uid()`), enforced because the client talks to Supabase directly.
- Columns for core structured data; JSONB only where data is genuinely sparse/variable (micronutrients, custom-tracker
  values, Analyst payloads).

### 9.2 Core entities

```text
profiles            user_id, display_name, currency='ALL', timezone='Europe/Tirane', rollover_hour=4
targets             id, user_id, key ('kcal_daily','protein_daily','budget_month','sleep_min',…), value, unit,
                    effective_from, source ('user'|'analyst'|'default'), recommendation_id NULL, note
                    → versioned history; "current" = latest effective_from ≤ date

entries             id, user_id, kind ('purchase','food','expense','income','workout','activity','sleep',
                    'measurement','mood','note','custom'), occurred_at, local_date, item_id NULL,
                    title, note, created_at, updated_at, deleted_at
entry_money         entry_id PK/FK, direction ('out'|'in'), amount, currency, category_id, recurring_id NULL
entry_nutrition     entry_id PK/FK, food_id NULL, quantity, unit ('g'|'ml'|'serving'), grams NULL,
                    kcal, protein_g, carbs_g, fat_g, fiber_g, sugar_g, sat_fat_g, sodium_mg, caffeine_mg  (NULL = unknown),
                    micros JSONB NULL ({nutrient_code: amount}), completeness, source  — snapshot at log time
entry_activity      entry_id, type ('walk','run','cycle',…), duration_min, distance_km, steps NULL, avg_hr NULL
entry_measurement   entry_id, metric ('bodyweight','waist',…), value, unit
sleep               entry_id, bed_at, wake_at, duration_min (derived), quality 1–5, local_date = wake date
day_checkins        user_id, local_date UNIQUE, mood, energy, stress NULL, productivity NULL, note, reflection

items               id, user_id, name, kind, default money (amount, category_id), food_id NULL,
                    default quantity/unit, use_count, last_used_at, favorite, archived
foods               id, user_id NULL (NULL = shared/imported cache), name, brand, barcode NULL,
                    basis ('100g'|'100ml'), kcal…caffeine per basis (NULL = unknown), micros JSONB,
                    servings JSONB ([{label:'1 can', grams:250}]), source ('off'|'usda'|'custom'|'label'),
                    source_id, completeness, verified_by_user
recipes             id, user_id, name, yield_grams; recipe_ingredients (food_id, grams) → computed into a food row

categories          id, user_id, name, parent_id NULL, monthly_budget NULL, essential, archived
recurring           id, user_id, template (amount, category, item_id), rule (monthly day N / weekly), next_due, active
                    → generates real entries (auto or "confirm due" prompt)

exercises           id, user_id NULL (shared library), name, primary_muscle, equipment, unilateral
workout_templates   id, user_id, name ('Pull Day'), schedule hint; template_exercises (exercise_id, order, target sets/reps)
workouts            entry_id PK/FK (kind='workout'), template_id NULL, started_at, ended_at, notes
workout_sets        id, workout_id, exercise_id, order, set_index, reps, weight_kg, rpe NULL, rir NULL,
                    is_warmup, completed_at
personal_records    derived (view or maintained table) — best e1RM / weight×reps / volume per exercise

plan_items          id, user_id, kind ('priority','task','routine','goal'), title, due_date NULL,
                    recurrence NULL, done_at NULL, local_date NULL

tracker_defs        id, user_id, name, fields JSONB ([{key,label,type:'number'|'text'|'choice'|'bool',unit}])
entry_custom        entry_id, tracker_id, values JSONB  — validated against tracker_defs on write

-- Analyst (later phases)
analyst_runs        id, user_id, imported_at, period_from, period_to, analyst_version, model, export_id, raw JSONB
recommendations     id, run_id, type, target_key, current_value, suggested_value, unit, reason, confidence,
                    status ('pending'|'accepted'|'rejected'|'expired'), decided_at, effective_from
```

**Red Bull example:** one `entries` row (kind `purchase`, item = Red Bull) + `entry_money` (180 ALL, Food & Drink) +
`entry_nutrition` (250 ml snapshot: 115 kcal, 27 g carbs, 27 g sugar, 80 mg caffeine, sodium if known). Finance views
sum `entry_money`; nutrition views sum `entry_nutrition`. One tap next time.

### 9.3 Tradeoffs explained
- **Facet tables vs one wide `entries` table:** facets keep each domain typed and indexable without 60 mostly-null
  columns; joins are 1:1 on PK and cheap. **vs separate silo tables (LevelUp):** silos make cross-domain events impossible.
- **Snapshot nutrition into entries:** history stays true when a food is corrected; costs a little duplication. Worth it.
- **Micros as JSONB with a fixed code registry:** sparse, source-dependent, analysed in bulk/export — not hot-path
  filters. Core macros + sugar/sodium/caffeine stay columns because Today/targets use them.
- **Derived over stored:** sleep duration, daily totals, PRs derived. Materialise only if measured slow.
- **No `daily_logs`.** `local_date` on the entry + an index on `(user_id, local_date)` covers it.

### 9.4 Analysis-ready by design
Every fact has a date, a domain, units, a source, and nulls for unknowns — exactly what the export needs. Export is a
read-only transformation (§13), never the Analyst reading production tables.

---

## 10. Performance architecture

**Goal:** every routine interaction (tab switch, open Quick Add, log a known item, add a set) completes in **< 100 ms
with no network**.

1. **Static SPA shell, not server rendering.** Build Buddy as a client-rendered app (recommendation: **Vite + React +
   TypeScript**), deployed as static files. The shell is cached by a service worker; opening the PWA shows the app from
   disk immediately. No per-navigation server work — tab switches are pure client renders.
2. **Local database is the UI's source of state.** IndexedDB holds recent data (e.g. last 90 days of entries + all
   items, foods used, categories, exercises, templates, targets). Screens read locally → instant. Recommended single
   dependency: **Dexie** (IndexedDB wrapper with live queries). It replaces a state manager, a cache framework, and an
   offline framework at once — justified because it is the core of the performance strategy.
3. **Writes: local first, outbox, background sync.** Save = write to IndexedDB + append to an outbox → UI updates and the
   sheet closes instantly → sync pushes outbox to Supabase (upsert by client UUID; idempotent, safe to retry) → pull
   changes since last sync (`updated_at > cursor`). Single user ⇒ last-write-wins is sufficient; no CRDTs.
4. **Supabase:** direct from the client via `supabase-js` with RLS (no API server, no Drizzle, no pooler). Project region
   **eu-central-1 (Frankfurt)** — closest to Tirana. Static hosting region irrelevant (CDN). If any server code is ever
   needed (e.g. a nutrition proxy), use Supabase Edge Functions or a region-pinned function next to the DB.
5. **Auth:** session read once from local storage at startup; no per-screen auth checks. RLS enforces ownership.
6. **Today aggregation:** computed on the client from today's local entries + current targets (a few dozen rows → sub-ms).
   No dashboard queries at all.
7. **History aggregation:** client-side for the cached window; for older/long ranges, a few Postgres views/RPCs over
   `(user_id, local_date)` indexes. Add a maintained `daily_totals` table only if measurement shows a need.
8. **Search:** items/foods searched locally first (recents → favourites → my foods); remote food databases queried only
   on "search more" or barcode, debounced, results cached locally.
9. **Poor network / offline:** everything except remote food search works offline; a small sync indicator shows pending
   count only when non-zero.
10. **No decorative latency:** no entrance animations, no count-up numbers, sheet animation ≤ 200 ms.
11. **Budget checks in each phase:** Lighthouse/Playwright mobile trace on 4G throttle: shell visible < 1 s on cold start,
    tab switch < 50 ms, Quick Add open < 50 ms.

**Native-later compatibility:** the data model, sync protocol, and Supabase backend are client-agnostic; a native iOS app
(HealthKit etc.) would be another client of the same tables and sync rules.

---

## 11. UI/UX direction

- **Interaction model:** *Open → glance → act → close.* One primary action (`+`) always reachable by thumb.
- **Visual philosophy:** calm native utility. Neutral surfaces (dark-first plus a real light theme), one accent,
  semantic colour only for meaning (over/under target), never section-colour blocks. Dense but breathable lists, not
  card spam; hairline separators over shadows.
- **Typography:** numbers are the hero — large tabular numerals, small quiet labels. System font stack (SF on iPhone)
  is the native-feeling, zero-cost default.
- **Design system:** a short token file (colour, space, radius, type scale, motion) + ~10 primitives (Button, Row,
  Sheet, NumberInput, Segmented, Stat, ProgressBar, Toast, ListSection, EmptyState). No UI kit initially; add Radix
  primitives only for accessibility-heavy pieces if hand-rolling proves costly.
- **Language:** evidence not judgement — "6h 12m · 48m below 30-day avg", never "Bad sleep!". Empty states one line + action.
- **Mobile ergonomics:** ≥44 px targets, numeric keyboards (`inputmode="decimal"`), actions above the keyboard,
  safe areas, no essential swipes, no horizontal scroll, one-handed reach for logging.
- **Progressive disclosure:** Today shows 1 number + 1 comparison per domain; tap → domain detail; detail → history.
- **Quick Add:** opens < 50 ms; recents/frequent first (ranked by frequency × recency × time-of-day); one tap logs with
  defaults + undo toast; long-press/secondary tap opens the editor for quantity/price tweaks; customisable later.
- **Workout mode:** full screen, huge targets, previous performance inline, tap-to-copy last set, ✓ completes set,
  rest timer optional, survives app kill, finish → real-progress summary.
- **Logging patterns:** remember last values; prefill sensible defaults; time defaults to now (editable); never confirm
  dialogs for reversible actions — undo instead.

---

## 12. V1 scope

### MUST HAVE (before you start using Buddy daily)
- PWA shell (installable, service worker, safe areas), 4-tab nav + Quick Add sheet
- Auth (single allowlisted user), RLS on all tables, local DB + outbox sync
- Entries + items model; Quick Add with recents and one-tap repeat; edit/delete with undo
- **Money:** expenses (+ income), categories, month total, monthly budget remaining, ALL currency
- **Nutrition (core):** custom foods (per 100 g/ml or per serving), item-based logging, kcal + protein/carbs/fat on Today,
  unknown ≠ 0
- **Body:** weight, sleep (bed/wake/quality), mood/energy, evening check-in
- Today screen with the above; a basic History day view
- Targets (kcal, protein, monthly budget, sleep) with defaults, editable under Me
- Docs (6 short files) + git checkpoints

### LATER (next phases, in order of value)
- Workout mode + templates + PRs (Phase 4 — large, deserves its own phase)
- Open Food Facts barcode + search; USDA fallback; recipes/saved meals
- Recurring expenses, category budgets, trends
- Activity/walking entries; History trends & comparisons; deterministic correlation signals
- Plan (priorities, routines, weekly goals)
- Custom trackers
- Analyst export, then recommendation import/review
- Reminders/notifications (Web Push on iOS PWA works but is limited)

### DO NOT BUILD YET
- Any XP, levels, coins, streak rewards, achievements, store
- AI calls inside Buddy; chat interface
- Onboarding wizard
- Multi-user/teams, sharing, admin
- Native iOS, HealthKit, widgets, watch
- Bank integrations, receipt OCR, multi-currency FX beyond storing the currency code
- Water, screen-time, social, career/projects/skills, learning domains (custom trackers cover them if ever wanted)
- Body-map or other metaphor navigation

---

## 13. Buddy Analyst architecture

```text
Buddy (capture + deterministic calculations)            Buddy Analyst (separate project)
──────────────────────────────────────────              ─────────────────────────────────
entries, facets, targets ──► Export builder             reads buddy-export/ only
                             (read-only transform)       specialist prompts (nutrition, training,
deterministic stats ───────► statistical-signals.json    finance, lifestyle, cross-domain)
                             buddy-export/ (versioned)   ──► buddy-analysis.json (strict schema)
                                    │                                  │
                                    ▼                                  ▼
                           you hand it to Claude        import into Buddy → review → approve/reject
```

- **Boundary:** Buddy never calls an AI in V1. The Analyst never touches the database. The only interfaces are two
  versioned JSON contracts: `buddy-export` (out) and `buddy-analysis` (in).
- **Export:** generated client-side (or one RPC) for a chosen period: profile + current targets + target history,
  per-domain daily series, item/food catalogs used, workouts with sets, notes/check-ins, data-quality metadata
  (missing days, completeness, sources), and `statistical-signals.json` (e.g. sleep↔energy Pearson/Spearman with n,
  CI/p, lag, missing %). Schema versioned (`export_version`).
- **Deterministic statistics in Buddy:** averages, deltas, adherence, weekday/weekend splits, lagged correlations with
  sample size and missing-data counts. The Analyst interprets; Buddy computes.
- **Analyst rules (in its prompts + output schema):** every claim tagged `observation | correlation | hypothesis |
  recommendation`, with n, period, confidence and caveats (confounders, missing data). No causal language for
  correlations.

---

## 14. Analyst feedback loop

**Output schema (v1 draft):**

```json
{
  "schema_version": "1",
  "analysis": { "id": "uuid", "created_at": "…", "period": {"from":"…","to":"…"},
                "export_id": "…", "analyst_version": "…", "model": "…" },
  "insights":        [{ "id":"…", "domain":"sleep", "level":"observation|correlation|hypothesis",
                        "text":"…", "evidence": {"n":56, "metric":"…", "value":…}, "confidence":"low|medium|high" }],
  "recommendations": [{ "id":"…", "text":"…", "rationale":"…", "insight_ids":["…"] }],
  "proposed_changes":[{ "id":"…", "type":"target", "target_key":"protein_daily",
                        "current_value":120, "suggested_value":150, "unit":"g",
                        "reason":"…", "confidence":"medium", "review_after_days":28 }],
  "warnings":  ["…"],
  "questions": ["…"]
}
```

**Safety boundaries**
- Import is a file you choose; Buddy validates it against the schema; unknown `type`s or out-of-bounds values are
  rejected (hard limits per target key, e.g. kcal 1200–5000).
- `current_value` must match Buddy's actual current value, else the proposal is marked stale.
- Nothing applies automatically. Each proposal is shown individually: *Current → Suggested · Reason* → **Apply** / **Keep
  current**. Accepting writes a new versioned `targets` row with `source='analyst'` and `recommendation_id`.
- Proposals can only touch an allow-listed set of configuration (targets, budgets, template set/rep targets). Never raw
  logged data, never deletes.

**History & intervention tracking**
- `recommendations` stores status, decided_at, effective_from. `targets` history shows "Sep 12 · Protein 120 → 150 g ·
  Buddy Analyst · training analysis".
- Next export includes accepted interventions with their effective dates, so the Analyst can evaluate before/after
  windows ("did it help?") — again as correlation with caveats.

---

## 15. Implementation roadmap

Each phase: confirm scope → build a thin vertical slice → **use it on the phone for a few days** → fix friction →
update docs → git checkpoint. No phase starts while the previous one is unused.

| Phase | Goal | Contents | Done when |
|---|---|---|---|
| **0** | Audit (this doc) | — | You approve the direction |
| **1 · Foundation + Money** | Something you use from week 1 | Vite/React PWA shell, auth, Supabase (eu-central-1) schema for profiles/targets/entries/money/items/categories, RLS, Dexie + outbox sync, Today (money), Quick Add with items + recents, edit/undo, docs | You log every purchase for 3–4 days without friction |
| **2 · Body & day** | Cheap, daily-value data | Sleep, weight, mood/energy, evening check-in, Today blocks, History day view | Check-in takes < 30 s; no duplicate asks |
| **3 · Nutrition** | Real food tracking | Foods (per 100 g/serving), custom/Albanian foods, items linking money+food (Red Bull), Open Food Facts barcode/search, USDA fallback, recipes/saved meals, nutrition detail | Familiar food in ≤ 2 taps; new local food in < 30 s |
| **4 · Training** | Replace your workout app | Exercise library, templates, Workout Mode, previous performance, PRs, summary, training history | A full session logged without leaving workout mode |
| **5 · Plan** | Light structure | Priorities, routines, weekly goals, workout schedule | Plan feeds Today without a management chore |
| **6 · History & signals** | Understand yourself | Trends, comparisons, weekday/weekend, deterministic correlations with n + caveats | Numbers trusted, not decorative |
| **7 · Analyst export** | Hand data to Claude | `buddy-export` v1 + signals + data quality | You run one real analysis |
| **8 · Analyst import** | Closed loop | Schema validation, review UI, versioned targets, recommendation history | One accepted change visible in history |

**Changes vs your proposed roadmap:** Finance merges into Foundation (a foundation you can't use teaches nothing);
sleep/mood/weight move *before* Nutrition (trivial to build, immediate daily habit); Plan moves after Training
(lowest-risk to defer). Custom trackers slot in after Phase 6 when you know what you're missing.

**Process rules carried from LevelUp's failure**
- Repo outside OneDrive (e.g. `C:\dev\buddy`) — faster tooling, no sync conflicts with `node_modules`.
- No custom subagents, no design-skill hooks, no MCP beyond Supabase + Playwright.
- Six docs, each < ~150 lines. No plan files over a few pages.
- Real data only; no seed universe. Tests for pure logic (dates, nutrition math, aggregates, sync) only.

---

## Open decisions for you

1. **Stack:** Vite + React SPA + Supabase direct + Dexie (recommended) — or keep Next.js as a client-only static export?
2. **New Supabase project in eu-central-1** (recommended) vs reuse the paused LevelUp project (eu-west-1, full of
   LevelUp schema)?
3. **Repo location:** OK to create Buddy outside OneDrive (e.g. `C:\dev\buddy`)?
4. **Optional:** restore LevelUp's Supabase project for a measured Playwright trace + region/JWT confirmation, or skip.
