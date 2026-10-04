import * as map from '../core/sync-map'
import { ENTRY_SELECT, FACETS, SPECS, type FacetTable, type Row, type TableSpec } from '../core/sync-map'
import type { Settings } from '../core/types'
import { db, DEFAULT_SETTINGS, type SyncTable } from './db'
import { supabase } from './supabase'

/*
 * Background sync. Push: replay the outbox as whole-row upserts (idempotent).
 * Pull: rows whose server_updated_at moved past our per-table cursor; the
 * newer `updated_at` wins. The UI never awaits any of this.
 */

export interface SyncState {
  status: 'idle' | 'syncing' | 'offline' | 'error' | 'signed-out'
  lastSyncedAt: string | null
  error?: string
}

let state: SyncState = { status: 'idle', lastSyncedAt: null }
const listeners = new Set<() => void>()
const setState = (patch: Partial<SyncState>) => {
  state = { ...state, ...patch }
  listeners.forEach((fn) => fn())
}
export const syncStore = {
  subscribe(fn: () => void) {
    listeners.add(fn)
    return () => listeners.delete(fn)
  },
  get: () => state,
}

type SpecTable = keyof typeof SPECS

/** Parents before children so foreign keys resolve on the server. */
const ORDER: SyncTable[] = [
  'profiles',
  'categories',
  'foods',
  'exercises',
  'templates',
  'trackers',
  'items',
  'entries',
  'sets',
  'checkins',
  'plan',
  'analystRuns',
  'recommendations',
  'targets',
  'moneyPlans',
]

/** Facets the app can remove from an existing entry; absent → delete server row. */
const REMOVABLE_FACETS: FacetTable[] = ['entry_money', 'entry_nutrition']

const CHUNK = 200
const keyOf = (table: string) => (table === 'checkins' ? 'localDate' : 'id')

async function upsert(table: string, rows: Row[], onConflict = 'id') {
  for (let i = 0; i < rows.length; i += CHUNK) {
    const { error } = await supabase.from(table).upsert(rows.slice(i, i + CHUNK), { onConflict })
    if (error) throw new Error(`${table}: ${error.message}`)
  }
}

async function localSettings(): Promise<{ settings: Settings; updatedAt: string }> {
  const row = await db.meta.get('settings')
  const v = (row?.value ?? {}) as Partial<Settings> & { updatedAt?: string }
  const { updatedAt, ...settings } = v
  return { settings: { ...DEFAULT_SETTINGS, ...settings }, updatedAt: updatedAt ?? new Date(0).toISOString() }
}

async function pushEntries(ids: string[]) {
  const rows = (await db.entries.bulkGet(ids)).filter((r) => r != null)
  const mapped = rows.map(map.entryToServer)
  await upsert('entries', mapped.map((m) => m.entry))
  for (const table of Object.keys(FACETS) as FacetTable[]) {
    await upsert(
      table,
      mapped.flatMap((m) => (m.facets[table] ? [m.facets[table]] : [])),
      'entry_id',
    )
    if (!REMOVABLE_FACETS.includes(table)) continue
    const absent = mapped.filter((m) => !m.facets[table]).map((m) => m.entry.id as string)
    for (let i = 0; i < absent.length; i += 100) {
      const { error } = await supabase.from(table).delete().in('entry_id', absent.slice(i, i + 100))
      if (error) throw new Error(`${table}: ${error.message}`)
    }
  }
}

async function push() {
  const ops = await db.outbox.toArray()
  if (!ops.length) return
  const maxSeq = Math.max(...ops.map((o) => o.seq ?? 0))
  const byTable = new Map<SyncTable, Set<string>>()
  for (const op of ops) {
    if (!byTable.has(op.table)) byTable.set(op.table, new Set())
    byTable.get(op.table)!.add(op.rowId)
  }

  for (const table of ORDER) {
    const ids = byTable.get(table)
    if (!ids) continue
    if (table === 'profiles') {
      const { settings, updatedAt } = await localSettings()
      await upsert('profiles', [map.settingsToServer(settings, updatedAt)], 'user_id')
    } else if (table === 'entries') {
      await pushEntries([...ids])
    } else {
      const spec = SPECS[table as SpecTable] as TableSpec<unknown>
      const rows = (await db.table(table).bulkGet([...ids])).filter((r) => r != null)
      await upsert(spec.server, rows.map(spec.toServer), spec.onConflict)
    }
  }
  // Only drop what we just sent; writes made meanwhile stay queued.
  await db.outbox.where('seq').belowOrEqual(maxSeq).delete()
}

const PAGE = 500

/** Fetch rows changed since this table's cursor, page by page. */
async function pullTable(table: string, select: string, apply: (rows: Row[]) => Promise<void>) {
  const key = `cursor:${table}`
  let cursor = ((await db.meta.get(key))?.value as string | undefined) ?? null
  // First page overlaps a few seconds so a commit that landed out of order isn't missed.
  let since = cursor ? new Date(Date.parse(cursor) - 5000).toISOString() : '1970-01-01T00:00:00Z'
  for (;;) {
    const { data, error } = await supabase
      .from(table)
      .select(select)
      .gt('server_updated_at', since)
      .order('server_updated_at')
      .limit(PAGE)
    if (error) throw new Error(`${table}: ${error.message}`)
    const rows = (data ?? []) as unknown as Row[]
    if (!rows.length) break
    await apply(rows)
    const last = rows[rows.length - 1].server_updated_at as string
    if (last === since) break
    cursor = since = last
    await db.meta.put({ key, value: cursor })
    if (rows.length < PAGE) break
  }
}

/** Put remote rows whose `updatedAt` is at least as new as the local copy. */
async function applyRemote(table: string, remote: Row[]) {
  const k = keyOf(table)
  const t = db.table(table)
  const locals = (await t.bulkGet(remote.map((r) => r[k] as string))) as (Row | undefined)[]
  await t.bulkPut(remote.filter((r, i) => map.remoteWins(locals[i]?.updatedAt as string | undefined, r.updatedAt as string)))
}

async function pull() {
  // Settings: single row.
  const { data: profile, error } = await supabase.from('profiles').select('*').maybeSingle()
  if (error) throw new Error(`profiles: ${error.message}`)
  if (profile) {
    const local = await localSettings()
    if (map.remoteWins(local.updatedAt, profile.updated_at)) {
      await db.meta.put({
        key: 'settings',
        value: { ...map.settingsFromServer(profile), updatedAt: new Date(profile.updated_at).toISOString() },
      })
    }
  }

  for (const table of ORDER) {
    if (table === 'profiles') continue
    if (table === 'entries') {
      await pullTable('entries', ENTRY_SELECT, (rows) =>
        applyRemote('entries', rows.map((r) => map.entryFromServer(r) as unknown as Row)),
      )
      continue
    }
    const spec = SPECS[table as SpecTable] as TableSpec<unknown>
    await pullTable(spec.server, '*', (rows) => applyRemote(table, rows.map((r) => spec.fromServer(r) as Row)))
  }
}

let running: Promise<void> | null = null
let again = false

/** Push then pull. Concurrent calls coalesce into one extra run. */
export function syncNow(): Promise<void> {
  if (running) {
    again = true
    return running
  }
  running = (async () => {
    try {
      const { data } = await supabase.auth.getSession()
      if (!data.session) return setState({ status: 'signed-out' })
      if (!navigator.onLine) return setState({ status: 'offline' })
      setState({ status: 'syncing' })
      await push()
      await pull()
      setState({ status: 'idle', lastSyncedAt: new Date().toISOString(), error: undefined })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setState({ status: navigator.onLine ? 'error' : 'offline', error: msg })
    } finally {
      running = null
      if (again) {
        again = false
        void syncNow()
      }
    }
  })()
  return running
}

let timer: ReturnType<typeof setTimeout> | undefined
/** Called after every local write: sync shortly, batching rapid taps. */
export function scheduleSync(delay = 800) {
  clearTimeout(timer)
  timer = setTimeout(() => void syncNow(), delay)
}

/** Keep syncing while the app is open: on resume, on reconnect, every minute. */
export function startAutoSync(): () => void {
  const onVisible = () => document.visibilityState === 'visible' && void syncNow()
  const onOnline = () => void syncNow()
  document.addEventListener('visibilitychange', onVisible)
  window.addEventListener('online', onOnline)
  const id = setInterval(() => document.visibilityState === 'visible' && void syncNow(), 60_000)
  return () => {
    document.removeEventListener('visibilitychange', onVisible)
    window.removeEventListener('online', onOnline)
    clearInterval(id)
  }
}

/** Push everything, then wipe this device's copy. Refuses if changes can't be uploaded. */
export async function signOut(): Promise<boolean> {
  await syncNow()
  if ((await db.outbox.count()) > 0) return false
  await supabase.auth.signOut()
  await db.delete()
  location.replace('/')
  return true
}
