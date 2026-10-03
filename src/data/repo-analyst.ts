import type { Analysis } from '../core/analyst'
import { targetOn } from '../core/targets'
import { addDays, weekStart } from '../core/dates'
import type { AnalystRun, LocalDate, PlanProposal, Recommendation, Synced } from '../core/types'
import { db } from './db'
import { created, now, patch, put } from './repo-base'
import { setTarget } from './repo'
import { addPlanItem } from './repo-plan'

export type RunInput = Omit<AnalystRun, keyof Synced | 'importedAt'>
export type ProposalInput = Pick<
  Recommendation,
  'type' | 'targetKey' | 'currentValue' | 'suggestedValue' | 'unit' | 'details' | 'reason' | 'confidence'
>

const same = (a: number | null, b: number | null) => (a == null || b == null ? a === b : Math.abs(a - b) < 0.005)

/** Is the proposal still about the value Buddy has now? */
export function isCurrent(rec: Pick<Recommendation, 'currentValue'>, live: number | null) {
  return same(rec.currentValue, live)
}

/**
 * Store an imported analysis and one recommendation per proposed change.
 * A proposal whose `currentValue` no longer matches Buddy's is stale from the start.
 */
export async function importAnalystRun(run: RunInput, proposals: ProposalInput[], today: LocalDate): Promise<AnalystRun> {
  const targets = await db.targets.toArray()
  const t = now()
  return db.transaction('rw', [db.analystRuns, db.recommendations, db.outbox], async () => {
    const row = await put<AnalystRun>('analystRuns', { ...created(t), ...run, importedAt: t })
    for (const p of proposals) {
      // Plan items can't go stale; a target proposal is stale if Buddy's value moved.
      const stale = p.type === 'target' && p.targetKey != null && !isCurrent(p, targetOn(targets, p.targetKey, today))
      await put<Recommendation>('recommendations', {
        ...created(t),
        ...p,
        runId: row.id,
        status: stale ? 'stale' : 'pending',
        decidedAt: null,
      })
    }
    return row
  })
}

/**
 * Apply a proposal: a new target version from today with Analyst provenance.
 * Re-checks the live value first; if it moved meanwhile, the proposal goes stale instead.
 */
export async function applyRecommendation(rec: Recommendation, today: LocalDate): Promise<'applied' | 'stale'> {
  if (rec.type === 'plan_item' && rec.details) {
    await addPlanItem(planInput(rec.details, today))
    await patch('recommendations', rec, { status: 'accepted', decidedAt: now() })
    return 'applied'
  }
  if (rec.targetKey == null || rec.suggestedValue == null || rec.unit == null) return 'stale'
  const live = targetOn(await db.targets.toArray(), rec.targetKey, today)
  if (!isCurrent(rec, live)) {
    await patch('recommendations', rec, { status: 'stale' })
    return 'stale'
  }
  await setTarget(rec.targetKey, rec.suggestedValue, rec.unit, today, { source: 'analyst', recommendationId: rec.id })
  await patch('recommendations', rec, { status: 'accepted', decidedAt: now() })
  return 'applied'
}

export function keepCurrent(rec: Recommendation) {
  return patch('recommendations', rec, { status: 'rejected', decidedAt: now() })
}

/** Put away a proposal that no longer matches the live target (stays `stale`, now decided). */
export function dismissStale(rec: Recommendation) {
  return patch('recommendations', rec, { status: 'stale', decidedAt: now() })
}

/**
 * Store a validated analysis. The same analysis (by `analysis.id`) can't be
 * imported twice — its proposals would duplicate.
 */
export async function importAnalysis(a: Analysis, today: LocalDate): Promise<{ run: AnalystRun; proposals: number } | 'duplicate'> {
  const runs = await db.analystRuns.toArray()
  if (runs.some((r) => !r.deletedAt && (r.payload as Analysis | null)?.analysis?.id === a.analysis.id)) return 'duplicate'
  const run = await importAnalystRun(
    {
      periodFrom: a.analysis.period.from,
      periodTo: a.analysis.period.to,
      analystVersion: a.analysis.analyst_version,
      model: a.analysis.model,
      payload: a,
    },
    a.proposed_changes.map((p) =>
      p.type === 'plan_item'
        ? {
            type: 'plan_item' as const,
            targetKey: null,
            currentValue: null,
            suggestedValue: null,
            unit: null,
            details: { kind: p.kind, title: p.title, weekdays: p.weekdays, week: p.week, date: p.date },
            reason: p.reason,
            confidence: p.confidence,
          }
        : {
            type: 'target' as const,
            targetKey: p.target_key,
            currentValue: p.current_value,
            suggestedValue: p.suggested_value,
            unit: p.unit,
            details: null,
            reason: p.reason,
            confidence: p.confidence,
          },
    ),
    today,
  )
  return { run, proposals: a.proposed_changes.length }
}

/** Where an accepted plan proposal lands, relative to the day it is applied. */
export function planInput(d: PlanProposal, today: LocalDate) {
  return {
    kind: d.kind,
    title: d.title,
    weekdays: d.kind === 'routine' ? d.weekdays : [],
    localDate:
      d.kind === 'goal'
        ? addDays(weekStart(today), d.week === 'next' ? 7 : 0)
        : d.kind === 'task'
          ? d.date && d.date > today
            ? d.date
            : d.date
              ? today
              : null
          : null,
  }
}
