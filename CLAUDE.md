# Buddy — working rules

Read `docs/ROADMAP.md` first (current phase + scope). Source of truth: the six files in `docs/`. Update the relevant
one when a decision changes; keep each short.

- Logger first. No gamification, no AI in the app, no onboarding wizard.
- Local-first: UI reads/writes Dexie via `src/data/repo.ts`; never make a routine interaction wait on the network.
- `src/core/` stays pure TypeScript (no React, no Dexie) — it must be reusable by a future native client.
- No new significant dependency without a demonstrated problem; say why before adding it.
- Mobile 390px first. ≥44px targets, ≥16px inputs, safe areas, evidence-not-judgement copy.
- Gates before a commit: `npx tsc -b`, `npx vitest run`, `npx vite build`.
- Don't polish small details while a major flow is unfinished — note them in ROADMAP "Known issues".
- LevelUp is dead reference material only; don't copy from it without a documented reason.
