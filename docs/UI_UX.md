# UI / UX

**Model:** open → glance → act → close.

## Navigation
`Today · History · [+] · Plan · Me` — the + is always dead centre (left group · + · right group). Plan joins in
Phase 5. Quick Add is the centre action; everything else lives deeper. Sub-screens (`/me/...`) get a back chevron
and keep their parent tab highlighted.

## Today
Answers "how is today going?" with one number + one comparison per domain. Money card: spent today, vs daily
average (only over days since you started), month spent / left vs budget, per-day allowance. Tiles (2 columns):
Sleep (vs 30-day avg of logged nights), Weight (Δ vs ~7 days), Activity (minutes/km/steps). Check-in row once done;
after 19:00 a "How was today?" prompt if it isn't. Then today's entries.

## Quick Add
- Opens instantly. A 4-column grid of icon actions (Food, Expense, Workout, Sleep, Weight, Activity, Check-in,
  Income, then custom trackers), search, then recents (frecency; pinned first) near the thumb.
- Tap a recent → logged with remembered values + Undo toast (2 taps total).
- Tap a recent's amount → opens the form prefilled (price changed; for food: portion/price).
- Workout Mode is the one full-screen flow: no tab bar, survives reloads, a resume bar follows you elsewhere.
- Search with no match → "Add “x”".

## Forms
Amount first (decimal keyboard, large). Name suggests known items (fills amount + category). Category = chips,
optional. Time defaults to now. Note hidden behind "+ Add note". No confirm dialogs — Undo instead.

## Visual rules — "premium calm" (revised 2026-10-03 after "looks like a 2010 website")
- Feel: iOS Health / Fitness / Things — layered surfaces, soft depth, generous radii, crisp type. Never a dashboard.
- Surfaces: grouped background (`#f2f2f7` / black) with white / `#1c1c1e` cards; soft shadow in light, hairline
  highlight in dark (no borders). Cards and fields inside sheets step up one level in dark mode.
- Colour: ink (near-black / near-white) for primary buttons, the + and every selected state (chips, scales,
  segments). Green accent for progress fills and focus. Each domain has a tint (`--c-*`, `ui/domains.ts`) used only
  as an identity mark (icon chip, card label) — colour says *what*, never good/bad. Warn orange only for "over".
- Type: SF Pro on Apple devices, self-hosted Inter elsewhere. Large titles 34px/750 with a small uppercase eyebrow;
  hero numbers 38px/700 tight tracking; tile values 26px; tabular numerals everywhere numbers align.
- Icons: hand-drawn 24px stroke set in `ui/icons.tsx` (no library); `IconChip` = tinted rounded square.
- Lists: inset grouped, inset hairline separators; rows carry an icon chip when they represent a domain.
- No gradients, no glow, no confetti, no marketing copy, one-line empty states.
- Touch: ≥44px targets (rows 60px, buttons 50px), inputs ≥16px, safe areas, sheets sit above the iOS keyboard (`--kb`).
- Motion: ≤200ms, transform/opacity only, press = subtle scale, reduced-motion respected. No count-ups.
- Language: evidence, never judgement.
