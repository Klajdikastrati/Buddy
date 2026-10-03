# Performance

## Budgets
| Interaction | Target |
|---|---|
| Tab switch, open Quick Add, log a known item | < 100 ms, zero network |
| Cold start of installed PWA | shell visible < 1 s (served from service worker) |
| Any routine write | UI updated before the network is touched |

## Strategy
Local-first: screens read IndexedDB; writes are local + outbox; sync runs in the background. Today aggregates are
computed client-side from a few dozen rows. No server rendering, no per-screen auth checks.

## Measurements
- 2026-10-03, dev build (unminified, StrictMode), 390×844 Chromium, localhost: History 49 ms · Me 91 ms ·
  Today 32 ms · open Quick Add 25 ms (click → painted). For comparison LevelUp measured 298–483 ms per tab on
  localhost before any real network latency.
- Production bundle: 108 KB gzip JS, 2.5 KB CSS (before supabase-js is imported).
- 2026-10-03, all phases built: 185 KB gzip main JS, 5 KB CSS; barcode scanner (2 KB) + ZXing ponyfill are lazy
  chunks and the 1.1 MB wasm loads only on first scan (not precached). Inter font 48 KB, precached.

## Why LevelUp was slow (don't repeat)
Server-rendered every tap, server-awaited every save + page re-render, auth re-checked up to 4× per navigation,
a DB write on every read, and likely Vercel functions in iad1 talking to a DB in eu-west-1. Details:
`docs/history/PHASE0_AUDIT_AND_PROPOSAL.md` §4.

## Known risks
- iOS may evict IndexedDB for non-installed sites after ~7 days unused → install to Home Screen; `navigator.storage.persist()` requested; cloud sync is the real safety net.
- Dexie live queries over large ranges: History pages 60 days at a time.
