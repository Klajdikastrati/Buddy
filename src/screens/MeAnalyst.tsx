import { useLiveQuery } from '../ui/live'
import { useRef, useState } from 'react'
import { describeProposal, validateAnalysis, type Analysis, type ProposedTarget } from '../core/analyst'
import { formatShortDate, formatWeekdays } from '../core/dates'
import { formatMoney } from '../core/money'
import { formatTarget, targetDef, targetOn } from '../core/targets'
import type { AnalystRun, Recommendation, TargetKey } from '../core/types'
import { db } from '../data/db'
import { applyRecommendation, dismissStale, importAnalysis, isCurrent, keepCurrent } from '../data/repo-analyst'
import { DOMAIN } from '../ui/domains'
import { SubHead } from '../ui/fields'
import { navigate, useSettings, useToday } from '../ui/hooks'
import { Icon, IconChip } from '../ui/icons'
import { openSheet } from '../ui/sheets'
import { toast } from '../ui/toast'

const LEVEL_LABEL: Record<string, string> = { observation: 'Observation', correlation: 'Correlation', hypothesis: 'Hypothesis', recommendation: 'Recommendation' }

/** Buddy Analyst round-trip: import an analysis, review each proposed change, apply or keep. */
export function MeAnalyst() {
  const settings = useSettings()
  const today = useToday(settings)
  const runs = useLiveQuery(() => db.analystRuns.filter((r) => !r.deletedAt).toArray(), [])
  const recs = useLiveQuery(() => db.recommendations.filter((r) => !r.deletedAt).toArray(), [])
  const targets = useLiveQuery(() => db.targets.toArray(), [])
  const [errors, setErrors] = useState<string[] | null>(null)
  const [open, setOpen] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  if (!runs || !recs || !targets) return null

  const cur = settings.currency
  const live = (key: string) => targetOn(targets, key as TargetKey, today)
  const fmt = (key: string | null, v: number | null) => (v == null || key == null ? 'none' : formatTarget(key as TargetKey, v, cur))
  const label = (r: Recommendation) => (r.targetKey ? targetDef(r.targetKey).label : 'Target')
  const describe = (r: Recommendation) => describeProposal(r.type, r.details, cur, formatMoney, formatShortDate, formatWeekdays)
  const runById = new Map(runs.map((r) => [r.id, r]))
  const open_ = recs.filter((r) => !r.decidedAt && (r.status === 'pending' || r.status === 'stale')).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  const decided = recs.filter((r) => r.decidedAt).sort((a, b) => b.decidedAt!.localeCompare(a.decidedAt!))

  async function onFile(file: File) {
    setErrors(null)
    let doc: unknown
    try {
      doc = JSON.parse(await file.text())
    } catch {
      return setErrors([`${file.name} isn’t valid JSON.`])
    }
    const result = validateAnalysis(doc, cur)
    if (!result.ok) return setErrors(result.errors)
    const imported = await importAnalysis(result.value, today)
    if (imported === 'duplicate') return toast('This analysis was already imported.')
    setOpen(imported.run.id)
    toast(imported.proposals ? `Imported · ${imported.proposals} proposed ${imported.proposals === 1 ? 'change' : 'changes'} to review` : 'Imported · no proposed changes')
  }

  async function apply(rec: Recommendation) {
    const outcome = await applyRecommendation(rec, today)
    if (outcome === 'stale') return toast('Your target changed since this analysis — proposal marked stale.')
    if (rec.type !== 'target') toast(`${describe(rec).done}: ${describe(rec).title}`)
    else toast(`${label(rec)} is now ${fmt(rec.targetKey, rec.suggestedValue)} from today`)
  }

  return (
    <div className="screen">
      <SubHead title="Analyst" back={() => navigate('/me')} />
      <div className="notice">
        <p>
          Buddy never runs AI itself. Export your data, let Claude analyse it, then import the <span className="num">buddy-analysis.json</span> it returns.{' '}
          <strong>Nothing changes until you apply a proposal.</strong>
        </p>
      </div>
      <div className="pair">
        <button type="button" className="btn btn-primary" onClick={() => fileRef.current?.click()}>
          <Icon name="download" size={18} />
          Import
        </button>
        <button type="button" className="btn btn-quiet" onClick={() => openSheet({ kind: 'analyst-export' })}>
          <Icon name="upload" size={18} />
          Export
        </button>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="application/json,.json"
        hidden
        aria-label="Analysis file"
        onChange={(e) => {
          const f = e.target.files?.[0]
          e.target.value = ''
          if (f) void onFile(f)
        }}
      />

      {errors && (
        <div className="notice error-card" role="alert">
          <p className="error-title">
            <Icon name="close" size={16} strokeWidth={2.6} />
            This file can’t be imported ({errors.length} {errors.length === 1 ? 'problem' : 'problems'})
          </p>
          <ul className="error-list num">
            {errors.slice(0, 12).map((e) => (
              <li key={e}>{e}</li>
            ))}
            {errors.length > 12 && <li>…and {errors.length - 12} more</li>}
          </ul>
          <p className="field-hint">Nothing was changed. Send this list back to Claude to fix the file.</p>
        </div>
      )}

      <section aria-labelledby="proposals-h">
        <h2 id="proposals-h" className="section-title">
          Proposed changes
        </h2>
        {open_.length ? (
          <div className="stack">
            {open_.map((r) => {
              if (r.type !== 'target' && r.details) return <AddProposalCard key={r.id} rec={r} info={describe(r)} onApply={() => void apply(r)} />
              const now = live(r.targetKey ?? '')
              const stale = r.status === 'stale' || !isCurrent(r, now)
              const run = runById.get(r.runId)
              return (
                <article key={r.id} className={`proposal ${stale ? 'is-stale' : ''}`}>
                  <div className="card-head">
                    <IconChip name="target" tint={DOMAIN.analyst.tint} size="sm" />
                    <h3 className="block-label" style={{ color: 'var(--c-analyst)' }}>
                      {label(r)}
                    </h3>
                    <span className={`pill pill-${r.confidence}`}>{r.confidence} confidence</span>
                  </div>
                  <p className="proposal-change num">
                    <span className="muted">{fmt(r.targetKey, r.currentValue)}</span>
                    <Icon name="chevronRight" size={20} strokeWidth={2.4} />
                    <span>{fmt(r.targetKey, r.suggestedValue)}</span>
                  </p>
                  <p className="proposal-reason">{r.reason}</p>
                  <p className="row-sub num">
                    {run ? `Analysis of ${formatShortDate(run.periodFrom ?? '')} – ${formatShortDate(run.periodTo ?? '')}` : 'Analysis'}
                    {reviewDays(run, r) ? ` · review after ${reviewDays(run, r)} days` : ''}
                  </p>
                  {stale ? (
                    <>
                      <p className="stale-note">
                        Your target is now {fmt(r.targetKey, now)}; this was proposed when it was {fmt(r.targetKey, r.currentValue)}.
                      </p>
                      <button type="button" className="btn btn-quiet full" onClick={() => void dismissStale(r)}>
                        Dismiss
                      </button>
                    </>
                  ) : (
                    <div className="pair">
                      <button type="button" className="btn btn-quiet" onClick={() => void keepCurrent(r).then(() => toast('Kept current'))}>
                        Keep current
                      </button>
                      <button type="button" className="btn btn-primary" onClick={() => void apply(r)}>
                        Apply
                      </button>
                    </div>
                  )}
                </article>
              )
            })}
          </div>
        ) : (
          <p className="muted pad-l">Nothing to review.</p>
        )}
      </section>

      {decided.length > 0 && (
        <section className="group" aria-labelledby="decided-h">
          <h2 id="decided-h" className="section-label">
            Decisions
          </h2>
          <ul className="list">
            {decided.map((r) => (
              <li key={r.id} className="list-row">
                <span className="row-main static">
                  <span className="row-title num">
                    {r.type !== 'target' && r.details
                      ? `${describe(r).label} · ${describe(r).title}`
                      : `${label(r)} · ${fmt(r.targetKey, r.currentValue)} → ${fmt(r.targetKey, r.suggestedValue)}`}
                  </span>
                  <span className="row-sub">
                    {r.status === 'accepted'
                      ? r.type !== 'target' && r.details
                        ? describe(r).done
                        : 'Applied'
                      : r.status === 'stale'
                        ? 'Out of date — dismissed'
                        : r.type !== 'target'
                          ? 'Skipped'
                          : 'Kept current'}
                    {r.decidedAt ? ` · ${formatShortDate(r.decidedAt.slice(0, 10))}` : ''}
                  </span>
                </span>
              </li>
            ))}
          </ul>
          <button type="button" className="btn-text" onClick={() => navigate('/me/targets')}>
            Target history
            <Icon name="chevronRight" size={16} strokeWidth={2.2} />
          </button>
        </section>
      )}

      {runs.length > 0 && (
        <section className="group" aria-labelledby="runs-h">
          <h2 id="runs-h" className="section-label">
            Imported analyses
          </h2>
          {[...runs]
            .sort((a, b) => b.importedAt.localeCompare(a.importedAt))
            .map((run) => (
              <RunCard key={run.id} run={run} open={open === run.id} onToggle={() => setOpen(open === run.id ? null : run.id)} />
            ))}
        </section>
      )}
    </div>
  )
}

function reviewDays(run: AnalystRun | undefined, rec: Recommendation): number | null {
  const payload = run?.payload as Partial<Analysis> | undefined
  return payload?.proposed_changes?.find((p): p is ProposedTarget => p.type === 'target' && p.target_key === rec.targetKey)?.review_after_days ?? null
}

/** Stored payloads are validated at import, but read defensively — the row syncs from the server. */
function sections(payload: unknown): Pick<Analysis, 'insights' | 'recommendations' | 'warnings' | 'questions'> {
  const a = (payload ?? {}) as Partial<Analysis>
  return { insights: a.insights ?? [], recommendations: a.recommendations ?? [], warnings: a.warnings ?? [], questions: a.questions ?? [] }
}

function RunCard({ run, open, onToggle }: { run: AnalystRun; open: boolean; onToggle: () => void }) {
  const a = sections(run.payload)
  return (
    <article className="run">
      <button type="button" className="run-head" onClick={onToggle} aria-expanded={open}>
        <IconChip name="sparkle" tint={DOMAIN.analyst.tint} />
        <span className="grow">
          <span className="row-title">
            {formatShortDate(run.periodFrom ?? '')} – {formatShortDate(run.periodTo ?? '')}
          </span>
          <span className="row-sub">
            Imported {formatShortDate(run.importedAt.slice(0, 10))}
            {run.model ? ` · ${run.model}` : ''} · {a.insights.length} insights
          </span>
        </span>
        <Icon name="chevronDown" size={18} strokeWidth={2.2} style={{ transform: open ? 'rotate(180deg)' : undefined }} />
      </button>
      {open && (
        <div className="run-body">
          {a.insights.map((i) => (
            <div key={i.id} className="insight">
              <span className={`pill pill-level`}>{LEVEL_LABEL[i.level]}</span>
              <span className="pill">{i.domain}</span>
              <span className={`pill pill-${i.confidence}`}>{i.confidence}</span>
              <p>{i.text}</p>
            </div>
          ))}
          {a.recommendations.length > 0 && (
            <>
              <h4 className="section-label">Advice</h4>
              <ul className="advice">
                {a.recommendations.map((r) => (
                  <li key={r.id}>
                    {r.text}
                    {r.rationale && <span className="row-sub"> — {r.rationale}</span>}
                  </li>
                ))}
              </ul>
            </>
          )}
          {a.warnings.length > 0 && (
            <>
              <h4 className="section-label">Warnings</h4>
              <ul className="advice">
                {a.warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            </>
          )}
          {a.questions.length > 0 && (
            <>
              <h4 className="section-label">Questions for you</h4>
              <ul className="advice">
                {a.questions.map((q) => (
                  <li key={q}>{q}</li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </article>
  )
}

const CARD: Record<string, { icon: 'plan' | 'money' | 'tracker' | 'workout'; tint: string; color: string }> = {
  plan_item: { icon: 'plan', tint: DOMAIN.plan.tint, color: 'var(--c-plan)' },
  money_plan: { icon: 'money', tint: DOMAIN.money.tint, color: 'var(--c-money)' },
  tracker: { icon: 'tracker', tint: DOMAIN.analyst.tint, color: 'var(--c-analyst)' },
  workout_template: { icon: 'workout', tint: DOMAIN.workout.tint, color: 'var(--c-workout)' },
}

/** Something the Analyst suggests adding (plan item, money plan row, tracker, template): add it, or skip. */
function AddProposalCard({ rec, info, onApply }: { rec: Recommendation; info: ReturnType<typeof describeProposal>; onApply: () => void }) {
  const look = CARD[rec.type] ?? CARD.plan_item
  return (
    <article className="proposal">
      <div className="card-head">
        <IconChip name={look.icon} tint={look.tint} size="sm" />
        <h3 className="block-label" style={{ color: look.color }}>
          {info.label}
        </h3>
        <span className={`pill pill-${rec.confidence}`}>{rec.confidence} confidence</span>
      </div>
      <p className="proposal-title">{info.title}</p>
      <p className="row-sub num">{info.sub}</p>
      <p className="proposal-reason">{rec.reason}</p>
      <div className="pair">
        <button type="button" className="btn btn-quiet" onClick={() => void keepCurrent(rec).then(() => toast('Skipped'))}>
          Skip
        </button>
        <button type="button" className="btn btn-primary" onClick={onApply}>
          {info.action}
        </button>
      </div>
    </article>
  )
}
