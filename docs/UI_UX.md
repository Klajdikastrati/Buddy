# UI / UX

**Model:** open → glance → act → close.

## Navigation
`Today · History · [+] · Plan · Me` — the + is always dead centre (left group · + · right group). Plan joins in
Phase 5. Quick Add is the centre action; everything else lives deeper. Sub-screens (`/me/...`) get a back chevron
and keep their parent tab highlighted.

## Today
Answers "how is today going?" with one number + one comparison per domain — **everything above the fold, no
scrolling to see the numbers** (user preference). One-line header, then a 2-column grid of compact tiles: Calories
(bar vs target, left, protein), Money (spent today, bar vs budget, left · per day), Sleep (vs 30-day avg), Weight
(Δ over ~7 days), Activity, Workout (in progress → resume; planned today → start; else this week). Then ≤3
priorities, the check-in row (evening prompt if missing), and today's entries in dense rows.

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
- Motion is spatial and never waits (user: "Instagram-like"; any delay is noticeable). Tabs are a horizontal
  pager — swipe or tap, pages slide by their position, scroll position kept per tab, re-tap = scroll to top.
  Detail screens push in from the right (tabs shift back + dim), edge-swipe back; Workout Mode slides up as a
  modal. Sheets slide up (iOS curve), slide down on every close, drag the header down to dismiss. ~340 ms
  `cubic-bezier(.22,1,.36,1)`, transform/opacity only, follows the finger, reduced-motion respected. No count-ups.
- Navigation never waits on data: tab screens stay mounted; Workout Mode draws its frame on the tap and fills in.
- Language: evidence, never judgement.
