# Roadmap

Each phase: thin slice → use it on the phone for a few days → fix friction → docs → git checkpoint.

## Current: Phase 1 — Foundation + Money
- [x] Vite/React PWA shell, tab bar, safe areas, dark/light tokens
- [x] Local data (Dexie) + outbox, entries/items/categories/targets
- [x] Quick Add with recents + one-tap repeat + Undo
- [x] Expense / income form (amount-first, item suggestions, categories, time, note)
- [x] Today money block (today, vs average, month, budget left, per-day allowance)
- [x] History (by day, edit/delete/undo), Me (budget, rollover hour, categories, items, backup download)
- [ ] **1b** Supabase project (eu-central-1), schema + RLS migrations, auth (single allowlisted email), sync
- [ ] Deploy (static hosting) + install on iPhone + real-device pass
- [ ] Use for 3–4 days, fix friction

## Next
2. Body & day — sleep (bed/wake/quality), weight, mood/energy, evening check-in
3. Nutrition — foods (per 100 g/serving), local/custom foods, items linking money+food, Open Food Facts barcode, recipes
4. Training — exercise library, templates, Workout Mode, previous performance, PRs
5. Plan — priorities, routines, weekly goals (Plan tab appears)
6. History & signals — trends, comparisons, deterministic correlations with n + caveats
7. Analyst export · 8. Analyst import (review/approve, versioned targets)

## Deferred / not now
XP/levels/coins/store · AI inside Buddy · onboarding wizard · multi-user · native iOS/HealthKit · bank sync ·
water/screen-time/career domains (custom trackers later if wanted).

## Known issues / notes
- Category budgets, recurring expenses: Phase 3+ of finance work (after real use shows the need).
- Undo of a one-tap log leaves the item's `useCount` incremented (harmless ranking nudge).
