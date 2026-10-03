import { describe, expect, it } from 'vitest'
import { validateAnalysis } from './analyst'

const valid = () => ({
  schema_version: '1',
  analysis: {
    id: 'an-2026-10-03',
    created_at: '2026-10-03T21:00:00Z',
    period: { from: '2026-07-06', to: '2026-10-03' },
    export_id: 'exp-1',
    analyst_version: '0.1',
    model: 'claude-opus-5-5',
  },
  insights: [
    { id: 'i1', domain: 'sleep', level: 'correlation', text: 'Longer sleep went with higher energy (r 0.34, n 41).', evidence: { r: 0.34, n: 41 }, confidence: 'medium' },
  ],
  recommendations: [{ id: 'r1', text: 'Aim for 7.5 h sleep on weeknights.', rationale: 'See i1', insight_ids: ['i1'] }],
  proposed_changes: [
    { id: 'p1', type: 'target', target_key: 'protein_daily', current_value: 150, suggested_value: 160, unit: 'g', reason: 'Training volume rose 20%.', confidence: 'medium', review_after_days: 28 },
    { id: 'p2', type: 'target', target_key: 'budget_month', current_value: null, suggested_value: 55000, unit: 'ALL', reason: 'Spending averaged 1,800 Lek/day.', confidence: 'low' },
  ],
  warnings: ['Food was logged on only 1 of 90 days.'],
  questions: ['Do weekend lunches include others?'],
})

describe('buddy-analysis v1 validation', () => {
  it('accepts a well-formed analysis', () => {
    const r = validateAnalysis(valid(), 'ALL')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value.proposed_changes.map((p) => [p.target_key, p.current_value, p.suggested_value, p.review_after_days])).toEqual([
      ['protein_daily', 150, 160, 28],
      ['budget_month', null, 55000, null],
    ])
    expect(r.value.insights[0].evidence).toEqual({ r: 0.34, n: 41 })
  })

  it('rejects another schema version or a non-object outright', () => {
    expect(validateAnalysis({ ...valid(), schema_version: '2' }, 'ALL')).toEqual({ ok: false, errors: ['schema_version: must be "1"'] })
    expect(validateAnalysis([1, 2], 'ALL')).toEqual({ ok: false, errors: ['The file must contain a JSON object.'] })
  })

  it('lists every problem with its path', () => {
    const doc = valid() as Record<string, any>
    doc.extra = true
    doc.analysis.period.from = '2026-13-01'
    doc.insights[0].level = 'fact'
    doc.proposed_changes[0].suggested_value = 400 // above protein max 300
    doc.proposed_changes[1].unit = 'EUR'
    const r = validateAnalysis(doc, 'ALL')
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.errors).toEqual([
      'extra: unknown field',
      'analysis.period.from: must be a date YYYY-MM-DD',
      'insights[0].level: must be one of observation, correlation, hypothesis, recommendation',
      'proposed_changes[0].suggested_value: 400 is outside the allowed 40–300 for protein_daily',
      'proposed_changes[1].unit: must be "ALL" for budget_month',
    ])
  })

  it('only lets allow-listed targets change, once each, and never to the same value', () => {
    const doc = valid() as Record<string, any>
    doc.proposed_changes = [
      { ...doc.proposed_changes[0], type: 'delete_entries' },
      { ...doc.proposed_changes[0], id: 'p3', target_key: 'salary' },
      { ...doc.proposed_changes[0], id: 'p4', suggested_value: 150 },
      { ...doc.proposed_changes[0], id: 'p5', suggested_value: 170, injected: 'x' },
    ]
    const r = validateAnalysis(doc, 'ALL')
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.errors).toEqual([
      'proposed_changes[0].type: "delete_entries" is not supported (only "target")',
      'proposed_changes[1].target_key: "salary" is not a target Buddy lets the Analyst change',
      'proposed_changes[2].suggested_value: equals the current value',
      'proposed_changes[3].injected: unknown field',
      'proposed_changes[3].target_key: protein_daily is proposed more than once',
    ])
  })

  it('treats missing optional sections as empty', () => {
    const { insights: _i, recommendations: _r, warnings: _w, questions: _q, ...rest } = valid()
    const r = validateAnalysis({ ...rest, proposed_changes: [] }, 'ALL')
    expect(r.ok && r.value.insights).toEqual([])
  })
})
