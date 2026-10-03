// buddy-analysis v1 — what Buddy Analyst hands back. Validated strictly: one
// bad field rejects the whole file, with every problem listed, because
// anything that can change a target must be exactly what Buddy expects.
import { isTargetKey, targetDef } from './targets'
import type { TargetKey } from './types'

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

export interface ProposedChange {
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
  c.arr(doc, 'proposed_changes', '', 20).forEach((raw, i) => {
    const p = `proposed_changes[${i}]`
    if (!isObj(raw)) return c.fail(p, 'must be an object')
    c.keys(raw, p, ['id', 'type', 'target_key', 'current_value', 'suggested_value', 'unit', 'reason', 'confidence', 'review_after_days'])
    const id = c.str(raw, 'id', p, { max: 200 })
    if (raw.type !== 'target') {
      c.fail(`${p}.type`, `"${String(raw.type)}" is not supported (only "target")`)
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
