# UI / UX

**Model:** open → glance → act → close.

## Navigation
`Today · History · [+] · Me` (Plan joins in Phase 5). Quick Add is the centre action; everything else lives deeper.

## Today
Answers "how is today going?" with one number + one comparison per domain. Money: spent today, vs daily average
(average only over days since you started), month spent / left vs budget, per-day allowance. Then today's entries.

## Quick Add
- Opens instantly. Expense / Income actions on top, search, then recents (frecency; pinned first) near the thumb.
- Tap a recent → logged with remembered values + Undo toast (2 taps total).
- Tap a recent's amount → opens the form prefilled (price changed).
- Search with no match → "Add “x”".

## Forms
Amount first (decimal keyboard, large). Name suggests known items (fills amount + category). Category = chips,
optional. Time defaults to now. Note hidden behind "+ Add note". No confirm dialogs — Undo instead.

## Visual rules
- Neutral surfaces, one accent (green), semantic colour only for meaning (warn when over budget). Dark + light from tokens.
- System font, tabular numerals, numbers are the hero; labels small and quiet.
- Hairline borders, no shadows, no gradients, no card spam, no marketing copy, one-line empty states.
- Touch: ≥44px targets (rows 56px, buttons 48px), inputs ≥16px, safe areas, sheets sit above the iOS keyboard (`--kb`).
- Motion: ≤200ms, transform/opacity only, reduced-motion respected. No entrance animations, no count-ups.
- Language: evidence, never judgement.
