# Product

**Buddy is a fast, mobile-first personal logger.** Capture real-world events once, with as little friction as possible,
and derive everything else. Complex underneath, simple on the surface.

Success metric: still opened daily six months from now.

## Is / is not
- **Is:** a logger first, a calm Today dashboard, deterministic stats, an exporter for Buddy Analyst.
- **Is not:** a game (no XP/levels/coins/store), a coach, a chatbot, a Notion clone, a SaaS dashboard.

## Principles
1. Every extra tap must justify itself. Design for the 500th use, not the first demo.
2. Log once, update every domain (one entry carries money + nutrition + … facets).
3. Never ask for what Buddy already knows or can derive.
4. It gets faster with use: items, recents, remembered values — no AI needed.
5. Unknown is unknown — never coerce missing data to zero.
6. Evidence, not judgement: "48m below your 30-day average", never "Bad sleep!".
7. Real life is the progress system: PRs, savings, sleep averages.
8. Configuration exists but stays out of daily flows. No setup wizard; sensible defaults.
9. AI analyses Buddy (separately, via export); AI never runs Buddy; changes need explicit approval.
10. Performance is a feature: no routine tap waits on the network.

## Decisions log
- 2026-10-03 — Built fresh from the LevelUp audit (`docs/history/PHASE0_AUDIT_AND_PROPOSAL.md`); no LevelUp code carried over.
- 2026-10-03 — PWA (website installed to Home Screen), not App Store. Revisit native (Expo/TestFlight) only if
  manual steps/sleep entry becomes a real pain after ~2 months of use.
- 2026-10-03 — Money ships first (with the foundation) so Buddy is used from week 1.
- 2026-10-03 — Plan tab hidden until Phase 5 — no empty tabs.
- 2026-10-03 — Visual direction raised to "premium calm" (user: too basic). The + stays centred in the tab bar.
- 2026-10-03 — Today is a compact tile grid (user dislikes scrolling); navigation is Instagram-style spatial
  motion — swipeable tab pager, pushed screens, draggable sheets (user: static/delayed feel is very noticeable).
