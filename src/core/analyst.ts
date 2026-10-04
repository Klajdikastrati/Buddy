// buddy-analysis v1 — what Buddy Analyst hands back. Validated strictly: one
// bad field rejects the whole file, with every problem listed, because
// anything that can change a target must be exactly what Buddy expects.
import { isTargetKey, targetDef } from './targets'
import type { MoneyPlanProposal, PartOfDay, PlanKind, PlanProposal, RecommendationType, TargetKey, TemplateProposal, TrackerFieldType, TrackerProposal } from './types'

export const ANALYSIS_SCHEMA_VERSION = '1'
const LEVELS = ['observation', 'correlation', 'hypothesis', 'recommendation'] as const
const CONFIDENCE = ['low', 'medium', 'high'] as const

export interface Insight {
  id: string
  domain: string
  level: (typeof LEVELS)[number]
  text: string
  evidence: Record<string, unknown> | null
  confidence: (typeof CONFIDENCE)[number]
}

export interface AnalystAdvice {
  id: string
  text: string
  rationale: string | null
  insight_ids: string[]
}

export interface ProposedTarget {
  id: string
  type: 'target'
  target_key: TargetKey
  current_value: number | null
  suggested_value: number
  unit: string
  reason: string
  confidence: (typeof CONFIDENCE)[number]
  review_after_days: number | null
}

/** A plan item to add: a weekly goal, a routine on weekdays, or a task on a day (null = someday). */
export interface ProposedPlanItem {
  id: string
  type: 'plan_item'
  kind: PlanKind
  title: string
  weekdays: number[]
  week: 'this' | 'next' | null
  date: string | null
  /** routine (habit) only: completions a day, part of day, and the cue it follows. */
  times_per_day: number
  part_of_day: PartOfDay
  cue: string | null
  reason: string
  confidence: (typeof CONFIDENCE)[number]
}

const PARTS_OF_DAY = ['morning', 'afternoon', 'evening', 'anytime'] as const

/** A monthly bill / income (day_of_month) or a planned one-off spend (date), in the user's currency. */
export interface ProposedMoneyPlan {
  id: string
  type: 'money_plan'
  kind: MoneyPlanProposal['kind']
  name: string
  amount: number
  currency: string
  day_of_month: number | null
  date: string | null
  reason: string
  confidence: (typeof CONFIDENCE)[number]
}

/** A custom tracker to create. */
export interface ProposedTracker {
  id: string
  type: 'tracker'
  name: string
  fields: TrackerProposal['fields']
  reason: string
  confidence: (typeof CONFIDENCE)[number]
}

/** A workout template; exercises by name, created if missing. */
export interface ProposedTemplate {
  id: string
  type: 'workout_template'
  name: string
  weekdays: number[]
  exercises: TemplateProposal['exercises']
  reason: string
  confidence: (typeof CONFIDENCE)[number]
}

export type ProposedChange = ProposedTarget | ProposedPlanItem | ProposedMoneyPlan | ProposedTracker | ProposedTemplate
export const PROPOSAL_TYPES = ['target', 'plan_item', 'money_plan', 'tracker', 'workout_template'] as const
const MONEY_KINDS = ['bill', 'income', 'planned'] as const
const FIELD_TYPES: readonly TrackerFieldType[] = ['number', 'text', 'bool', 'count']

const PLAN_KINDS = ['goal', 'routine', 'task'] as const

/** A validated analysis, exactly as stored in `analyst_runs.payload`. */
export interface Analysis {
  schema_version: '1'
  analysis: {
    id: string
    created_at: string
    period: { from: string; to: string }
    export_id: string | null
    analyst_version: string | null
    model: string | null
  }
  insights: Insight[]
  recommendations: AnalystAdvice[]
  proposed_changes: ProposedChange[]
  warnings: string[]
  questions: string[]
}

export type ValidationResult = { ok: true; value: Analysis } | { ok: false; errors: string[] }

type Obj = Record<string, unknown>
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v)
const DATE = /^\d{4}-\d{2}-\d{2}$/
const validDate = (s: string) => DATE.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`)) && new Date(`${s}T00:00:00Z`).toISOString().startsWith(s)

/** Collects errors with a path; each check returns the value (or a fallback) so parsing can continue. */
class Checker {
  errors: string[] = []
  fail(path: string, msg: string) {
    this.errors.push(`${path}: ${msg}`)
  }
  keys(o: Obj, path: string, allowed: string[]) {
    for (const k of Object.keys(o)) if (!allowed.includes(k)) this.fail(path ? `${path}.${k}` : k, 'unknown field')
  }
  str(o: Obj, key: string, path: string, { max = 2000, optional = false, nullable = false } = {}): string | null {
    const v = o[key]
    const p = `${path}.${key}`
    if (v === undefined && optional) return null
    if (v === null && nullable) return null
    if (typeof v !== 'string' || !v.trim()) {
      this.fail(p, nullable ? 'must be a non-empty string or null' : 'must be a non-empty string')
      return null
    }
    if (v.length > max) this.fail(p, `must be at most ${max} characters`)
    return v
  }
  num(o: Obj, key: string, path: string, { nullable = false } = {}): number | null {
    const v = o[key]
    if (v === null && nullable) return null
    if (typeof v !== 'number' || !Number.isFinite(v)) {
      this.fail(`${path}.${key}`, nullable ? 'must be a number or null' : 'must be a number')
      return null
    }
    return v
  }
  oneOf<T extends string>(o: Obj, key: string, path: string, options: readonly T[]): T | null {
    const v = o[key]
    if (typeof v !== 'string' || !options.includes(v as T)) {
      this.fail(`${path}.${key}`, `must be one of ${options.join(', ')}`)
      return null
    }
    return v as T
  }
  arr(o: Obj, key: string, path: string, max: number): unknown[] {
    const v = o[key]
    if (v === undefined) return []
    if (!Array.isArray(v)) {
      this.fail(path ? `${path}.${key}` : key, 'must be an array')
      return []
    }
    if (v.length > max) this.fail(path ? `${path}.${key}` : key, `must have at most ${max} items`)
    return v
  }
}

/**
 * Validate a parsed buddy-analysis.json. `currency` is the unit a budget
 * proposal must use. Proposals may only change allow-listed targets, within
 * bounds, in the right unit.
 */
export function validateAnalysis(doc: unknown, currency: string): ValidationResult {
  const c = new Checker()
  if (!isObj(doc)) return { ok: false, errors: ['The file must contain a JSON object.'] }
  c.keys(doc, '', ['schema_version', 'analysis', 'insights', 'recommendations', 'proposed_changes', 'warnings', 'questions'])
  if (doc.schema_version !== ANALYSIS_SCHEMA_VERSION) {
    c.fail('schema_version', `must be "${ANALYSIS_SCHEMA_VERSION}"`)
    return { ok: false, errors: c.errors }
  }

  /* analysis */
  let analysis: Analysis['analysis'] | null = null
  if (!isObj(doc.analysis)) c.fail('analysis', 'must be an object')
  else {
    const a = doc.analysis
    c.keys(a, 'analysis', ['id', 'created_at', 'period', 'export_id', 'analyst_version', 'model'])
    const id = c.str(a, 'id', 'analysis', { max: 200 })
    const created = c.str(a, 'created_at', 'analysis', { max: 40 })
    if (created && Number.isNaN(Date.parse(created))) c.fail('analysis.created_at', 'must be an ISO date-time')
    let period: { from: string; to: string } | null = null
    if (!isObj(a.period)) c.fail('analysis.period', 'must be an object with from and to')
    else {
      c.keys(a.period, 'analysis.period', ['from', 'to'])
      const from = c.str(a.period, 'from', 'analysis.period', { max: 10 })
      const to = c.str(a.period, 'to', 'analysis.period', { max: 10 })
      if (from && !validDate(from)) c.fail('analysis.period.from', 'must be a date YYYY-MM-DD')
      if (to && !validDate(to)) c.fail('analysis.period.to', 'must be a date YYYY-MM-DD')
      if (from && to && validDate(from) && validDate(to) && from > to) c.fail('analysis.period', 'from must not be after to')
      if (from && to) period = { from, to }
    }
    const exportId = c.str(a, 'export_id', 'analysis', { max: 200, optional: true, nullable: true })
    const version = c.str(a, 'analyst_version', 'analysis', { max: 80, optional: true, nullable: true })
    const model = c.str(a, 'model', 'analysis', { max: 120, optional: true, nullable: true })
    if (id && created && period) analysis = { id, created_at: created, period, export_id: exportId, analyst_version: version, model }
  }

  /* insights */
  const insights: Insight[] = []
  c.arr(doc, 'insights', '', 100).forEach((raw, i) => {
    const p = `insights[${i}]`
    if (!isObj(raw)) return c.fail(p, 'must be an object')
    c.keys(raw, p, ['id', 'domain', 'level', 'text', 'evidence', 'confidence'])
    const id = c.str(raw, 'id', p, { max: 200 })
    const domain = c.str(raw, 'domain', p, { max: 40 })
    const level = c.oneOf(raw, 'level', p, LEVELS)
    const text = c.str(raw, 'text', p, { max: 2000 })
    const confidence = c.oneOf(raw, 'confidence', p, CONFIDENCE)
    let evidence: Record<string, unknown> | null = null
    if (raw.evidence !== undefined && raw.evidence !== null) {
      if (!isObj(raw.evidence)) c.fail(`${p}.evidence`, 'must be an object or null')
      else if (JSON.stringify(raw.evidence).length > 4000) c.fail(`${p}.evidence`, 'is too large')
      else evidence = raw.evidence
    }
    if (id && domain && level && text && confidence) insights.push({ id, domain, level, text, evidence, confidence })
  })

  /* recommendations (advice text, read-only) */
  const recommendations: AnalystAdvice[] = []
  c.arr(doc, 'recommendations', '', 50).forEach((raw, i) => {
    const p = `recommendations[${i}]`
    if (!isObj(raw)) return c.fail(p, 'must be an object')
    c.keys(raw, p, ['id', 'text', 'rationale', 'insight_ids'])
    const id = c.str(raw, 'id', p, { max: 200 })
    const text = c.str(raw, 'text', p, { max: 2000 })
    const rationale = c.str(raw, 'rationale', p, { max: 2000, optional: true, nullable: true })
    const ids = c.arr(raw, 'insight_ids', p, 50)
    if (ids.some((x) => typeof x !== 'string')) c.fail(`${p}.insight_ids`, 'must be strings')
    if (id && text) recommendations.push({ id, text, rationale, insight_ids: ids.filter((x): x is string => typeof x === 'string') })
  })

  /* proposed changes — the only part that can touch Buddy */
  const proposed: ProposedChange[] = []
  const seenKeys = new Set<string>()
  let planCount = 0
  let setupCount = 0
  const weekdaysOf = (raw: Obj, p: string): number[] | null => {
    const w = raw.weekdays
    if (!Array.isArray(w) || w.some((d) => !Number.isInteger(d) || d < 0 || d > 6) || new Set(w).size !== w.length) {
      c.fail(`${p}.weekdays`, 'must be distinct weekdays 0–6 (0 = Sunday)')
      return null
    }
    return [...(w as number[])].sort()
  }
  c.arr(doc, 'proposed_changes', '', 40).forEach((raw, i) => {
    const p = `proposed_changes[${i}]`
    if (!isObj(raw)) return c.fail(p, 'must be an object')
    if (raw.type === 'money_plan' || raw.type === 'tracker' || raw.type === 'workout_template') {
      if (++setupCount > 15) return c.fail(p, 'at most 15 money_plan / tracker / workout_template items per analysis')
    }
    if (raw.type === 'money_plan') {
      c.keys(raw, p, ['id', 'type', 'kind', 'name', 'amount', 'currency', 'day_of_month', 'date', 'reason', 'confidence'])
      const id = c.str(raw, 'id', p, { max: 200 })
      const kind = c.oneOf(raw, 'kind', p, MONEY_KINDS)
      const name = c.str(raw, 'name', p, { max: 80 })
      const amount = c.num(raw, 'amount', p)
      if (amount != null && (amount <= 0 || amount > 5_000_000)) c.fail(`${p}.amount`, 'must be more than 0 and at most 5000000')
      if (raw.currency !== currency) c.fail(`${p}.currency`, `must be "${currency}" (convert amounts to the user's currency)`)
      let day: number | null = null
      let date: string | null = null
      if (kind === 'planned') {
        if (typeof raw.date !== 'string' || !validDate(raw.date)) c.fail(`${p}.date`, 'a planned spend needs a date YYYY-MM-DD')
        else date = raw.date
        if (raw.day_of_month !== undefined && raw.day_of_month !== null) c.fail(`${p}.day_of_month`, 'only bills and income repeat monthly')
      } else if (kind) {
        const d = raw.day_of_month
        if (typeof d !== 'number' || !Number.isInteger(d) || d < 1 || d > 31) c.fail(`${p}.day_of_month`, 'bills and income need day_of_month 1–31')
        else day = d
        if (raw.date !== undefined && raw.date !== null) c.fail(`${p}.date`, 'only planned spends have a date')
      }
      const reason = c.str(raw, 'reason', p, { max: 1000 })
      const confidence = c.oneOf(raw, 'confidence', p, CONFIDENCE)
      if (id && kind && name && amount != null && reason && confidence && (day != null || date != null)) {
        proposed.push({ id, type: 'money_plan', kind, name, amount, currency, day_of_month: day, date, reason, confidence })
      }
      return
    }
    if (raw.type === 'tracker') {
      c.keys(raw, p, ['id', 'type', 'name', 'fields', 'reason', 'confidence'])
      const id = c.str(raw, 'id', p, { max: 200 })
      const name = c.str(raw, 'name', p, { max: 60 })
      const fields: TrackerProposal['fields'] = []
      const rawFields = c.arr(raw, 'fields', p, 8)
      if (!rawFields.length) c.fail(`${p}.fields`, 'needs at least one field')
      rawFields.forEach((f, j) => {
        const fp = `${p}.fields[${j}]`
        if (!isObj(f)) return c.fail(fp, 'must be an object')
        c.keys(f, fp, ['label', 'type', 'unit'])
        const label = c.str(f, 'label', fp, { max: 40 })
        const type = c.oneOf(f, 'type', fp, FIELD_TYPES)
        const unit = c.str(f, 'unit', fp, { max: 20, optional: true, nullable: true })
        if (label && type) fields.push({ label, type, unit: type === 'number' ? unit : null })
      })
      const reason = c.str(raw, 'reason', p, { max: 1000 })
      const confidence = c.oneOf(raw, 'confidence', p, CONFIDENCE)
      if (id && name && fields.length && reason && confidence) proposed.push({ id, type: 'tracker', name, fields, reason, confidence })
      return
    }
    if (raw.type === 'workout_template') {
      c.keys(raw, p, ['id', 'type', 'name', 'weekdays', 'exercises', 'reason', 'confidence'])
      const id = c.str(raw, 'id', p, { max: 200 })
      const name = c.str(raw, 'name', p, { max: 60 })
      const weekdays = weekdaysOf(raw, p)
      const exercises: TemplateProposal['exercises'] = []
      const rawEx = c.arr(raw, 'exercises', p, 15)
      if (!rawEx.length) c.fail(`${p}.exercises`, 'needs at least one exercise')
      rawEx.forEach((x, j) => {
        const xp = `${p}.exercises[${j}]`
        if (!isObj(x)) return c.fail(xp, 'must be an object')
        c.keys(x, xp, ['name', 'sets', 'reps'])
        const exName = c.str(x, 'name', xp, { max: 60 })
        const sets = x.sets
        if (typeof sets !== 'number' || !Number.isInteger(sets) || sets < 1 || sets > 10) c.fail(`${xp}.sets`, 'must be a whole number 1–10')
        const reps = x.reps
        if (reps !== undefined && reps !== null && (typeof reps !== 'number' || !Number.isInteger(reps) || reps < 1 || reps > 100)) {
          c.fail(`${xp}.reps`, 'must be a whole number 1–100 or null')
        }
        if (exName && typeof sets === 'number') exercises.push({ name: exName, sets, reps: typeof reps === 'number' ? reps : null })
      })
      const reason = c.str(raw, 'reason', p, { max: 1000 })
      const confidence = c.oneOf(raw, 'confidence', p, CONFIDENCE)
      if (id && name && weekdays && exercises.length && reason && confidence) {
        proposed.push({ id, type: 'workout_template', name, weekdays, exercises, reason, confidence })
      }
      return
    }
    if (raw.type === 'plan_item') {
      c.keys(raw, p, ['id', 'type', 'kind', 'title', 'weekdays', 'week', 'date', 'times_per_day', 'part_of_day', 'cue', 'reason', 'confidence'])
      if (++planCount > 10) return c.fail(p, 'at most 10 plan items per analysis')
      const id = c.str(raw, 'id', p, { max: 200 })
      const kind = c.oneOf(raw, 'kind', p, PLAN_KINDS)
      const title = c.str(raw, 'title', p, { max: 120 })
      const reason = c.str(raw, 'reason', p, { max: 1000 })
      const confidence = c.oneOf(raw, 'confidence', p, CONFIDENCE)
      let weekdays: number[] = []
      let week: 'this' | 'next' | null = null
      let date: string | null = null
      if (kind === 'routine') {
        const w = raw.weekdays
        if (!Array.isArray(w) || !w.length || w.some((d) => !Number.isInteger(d) || d < 0 || d > 6) || new Set(w).size !== w.length) {
          c.fail(`${p}.weekdays`, 'a routine needs distinct weekdays 0–6 (0 = Sunday)')
        } else weekdays = [...(w as number[])].sort()
      } else if (raw.weekdays !== undefined && !(Array.isArray(raw.weekdays) && raw.weekdays.length === 0)) {
        c.fail(`${p}.weekdays`, 'only routines have weekdays')
      }
      if (kind === 'goal') {
        if (raw.week !== 'this' && raw.week !== 'next') c.fail(`${p}.week`, 'a goal needs week "this" or "next"')
        else week = raw.week
      } else if (raw.week !== undefined && raw.week !== null) c.fail(`${p}.week`, 'only goals have a week')
      if (kind === 'task' && raw.date !== undefined && raw.date !== null) {
        if (typeof raw.date !== 'string' || !validDate(raw.date)) c.fail(`${p}.date`, 'must be a date YYYY-MM-DD or null (someday)')
        else date = raw.date
      } else if (kind !== 'task' && raw.date !== undefined && raw.date !== null) c.fail(`${p}.date`, 'only tasks have a date')
      // Habit details (routines only; all optional).
      let times = 1
      let part: PartOfDay = 'anytime'
      let cue: string | null = null
      const habitKeys = ['times_per_day', 'part_of_day', 'cue'].filter((k) => raw[k] !== undefined && raw[k] !== null)
      if (kind && kind !== 'routine') habitKeys.forEach((k) => c.fail(`${p}.${k}`, 'only routines (habits) have this'))
      if (kind === 'routine') {
        const t = raw.times_per_day
        if (t !== undefined && t !== null) {
          if (typeof t !== 'number' || !Number.isInteger(t) || t < 1 || t > 10) c.fail(`${p}.times_per_day`, 'must be a whole number 1–10')
          else times = t
        }
        if (raw.part_of_day !== undefined && raw.part_of_day !== null) part = c.oneOf(raw, 'part_of_day', p, PARTS_OF_DAY) ?? 'anytime'
        if (raw.cue !== undefined && raw.cue !== null) cue = c.str(raw, 'cue', p, { max: 120 })
      }
      if (id && kind && title && reason && confidence) {
        proposed.push({ id, type: 'plan_item', kind, title, weekdays, week, date, times_per_day: times, part_of_day: part, cue, reason, confidence })
      }
      return
    }
    c.keys(raw, p, ['id', 'type', 'target_key', 'current_value', 'suggested_value', 'unit', 'reason', 'confidence', 'review_after_days'])
    const id = c.str(raw, 'id', p, { max: 200 })
    if (raw.type !== 'target') {
      c.fail(`${p}.type`, `"${String(raw.type)}" is not supported (one of ${PROPOSAL_TYPES.join(', ')})`)
      return
    }
    const key = raw.target_key
    if (!isTargetKey(key)) {
      c.fail(`${p}.target_key`, `"${String(key)}" is not a target Buddy lets the Analyst change`)
      return
    }
    if (seenKeys.has(key)) c.fail(`${p}.target_key`, `${key} is proposed more than once`)
    seenKeys.add(key)
    const def = targetDef(key)
    const current = c.num(raw, 'current_value', p, { nullable: true })
    const suggested = c.num(raw, 'suggested_value', p)
    if (suggested != null && (suggested < def.min || suggested > def.max)) {
      c.fail(`${p}.suggested_value`, `${suggested} is outside the allowed ${def.min}–${def.max} for ${key}`)
    }
    if (suggested != null && current != null && Math.abs(suggested - current) < 0.005) c.fail(`${p}.suggested_value`, 'equals the current value')
    const unit = c.str(raw, 'unit', p, { max: 20 })
    const expected = def.unit ?? currency
    if (unit && unit !== expected) c.fail(`${p}.unit`, `must be "${expected}" for ${key}`)
    const reason = c.str(raw, 'reason', p, { max: 1000 })
    const confidence = c.oneOf(raw, 'confidence', p, CONFIDENCE)
    let review: number | null = null
    if (raw.review_after_days !== undefined && raw.review_after_days !== null) {
      const r = raw.review_after_days
      if (typeof r !== 'number' || !Number.isInteger(r) || r < 1 || r > 365) c.fail(`${p}.review_after_days`, 'must be a whole number of days, 1–365, or null')
      else review = r
    }
    if (id && suggested != null && unit && reason && confidence && (raw.current_value === null || current != null)) {
      proposed.push({ id, type: 'target', target_key: key, current_value: current, suggested_value: suggested, unit, reason, confidence, review_after_days: review })
    }
  })

  /* warnings / questions */
  const strings = (key: 'warnings' | 'questions') =>
    c.arr(doc, key, '', 50).flatMap((v, i) => {
      if (typeof v !== 'string' || !v.trim() || v.length > 1000) {
        c.fail(`${key}[${i}]`, 'must be a non-empty string of at most 1000 characters')
        return []
      }
      return [v]
    })
  const warnings = strings('warnings')
  const questions = strings('questions')

  if (c.errors.length || !analysis) return { ok: false, errors: c.errors.length ? c.errors : ['analysis is missing'] }
  return { ok: true, value: { schema_version: '1', analysis, insights, recommendations, proposed_changes: proposed, warnings, questions } }
}

/** How a non-target proposal reads in Buddy: a heading, the thing itself, and when/what. */
export function describeProposal(type: RecommendationType, details: unknown, currency: string, fmtMoney: (n: number, c: string) => string, fmtDate: (d: string) => string, fmtDays: (d: number[]) => string) {
  if (type === 'plan_item') {
    const d = details as PlanProposal
    const label = d.kind === 'goal' ? 'Weekly goal' : d.kind === 'routine' ? 'Habit' : 'Task'
    const habit = [(d.timesPerDay ?? 1) > 1 ? `${d.timesPerDay}× a day` : null, d.partOfDay && d.partOfDay !== 'anytime' ? d.partOfDay : null, d.cue ? `after ${d.cue}` : null]
    const when =
      d.kind === 'goal'
        ? d.week === 'next'
          ? 'Next week'
          : 'This week'
        : d.kind === 'routine'
          ? [fmtDays(d.weekdays), ...habit].filter(Boolean).join(' · ')
          : d.date
            ? fmtDate(d.date)
            : 'Someday'
    return { label, title: d.title, sub: when, action: 'Add to plan', done: 'Added to Plan' }
  }
  if (type === 'money_plan') {
    const d = details as MoneyPlanProposal
    const label = d.kind === 'income' ? 'Income' : d.kind === 'bill' ? 'Monthly bill' : 'Planned spend'
    const when = d.kind === 'planned' && d.date ? fmtDate(d.date) : `every month, day ${d.dayOfMonth}`
    return { label, title: d.name, sub: `${fmtMoney(d.amount, currency)} · ${when}`, action: 'Add to money plan', done: 'Added to money plan' }
  }
  if (type === 'tracker') {
    const d = details as TrackerProposal
    return { label: 'Tracker', title: d.name, sub: d.fields.map((f) => (f.unit ? `${f.label} (${f.unit})` : f.label)).join(' · '), action: 'Create tracker', done: 'Tracker created' }
  }
  const d = details as TemplateProposal
  return {
    label: 'Workout template',
    title: d.name,
    sub: `${d.weekdays.length ? `${fmtDays(d.weekdays)} · ` : ''}${d.exercises.map((x) => `${x.name} ${x.sets}×${x.reps ?? '–'}`).join(' · ')}`,
    action: 'Create template',
    done: 'Template created',
  }
}
