import { useState } from 'react'
import { addDays } from '../core/dates'
import { formatMoney, parseAmount } from '../core/money'
import { parseDecimal } from '../core/numbers'
import type { MoneyPlan, MoneyPlanKind } from '../core/types'
import { logMoney } from '../data/repo'
import { addMoneyPlan, setBalance, setMoneyPlanDeleted, updateMoneyPlan } from '../data/repo-money'
import { Segmented, SheetFooter } from '../ui/fields'
import { useSettings, useToday } from '../ui/hooks'
import { closeSheet } from '../ui/sheets'
import { Sheet } from '../ui/Sheet'
import { toast } from '../ui/toast'

const FORM = 'money-plan-form'
type PlanKind = Exclude<MoneyPlanKind, 'balance'>
const KINDS = [
  { value: 'bill', label: 'Monthly bill' },
  { value: 'income', label: 'Income' },
  { value: 'planned', label: 'Planned' },
] as const
const PLACEHOLDER: Record<PlanKind, string> = { bill: 'Phone', income: 'Salary', planned: 'Trip' }

/** Add or edit a monthly bill, an income, or a planned one-off spend. */
export function MoneyPlanSheet({ plan, kind: initial }: { plan?: MoneyPlan; kind?: PlanKind }) {
  const settings = useSettings()
  const today = useToday(settings)
  const [kind, setKind] = useState<PlanKind>((plan?.kind as PlanKind | undefined) ?? initial ?? 'bill')
  const [name, setName] = useState(plan?.name ?? '')
  const [amount, setAmount] = useState(plan ? String(plan.amount) : '')
  const [day, setDay] = useState(plan?.dayOfMonth ? String(plan.dayOfMonth) : '')
  const [date, setDate] = useState(plan?.date ?? addDays(today, 7))
  const [error, setError] = useState<string | null>(null)

  async function save() {
    const value = parseAmount(amount)
    const dom = Number(day)
    if (!name.trim()) return setError('Give it a name.')
    if (value == null) return setError('Enter an amount.')
    if (kind !== 'planned' && !(Number.isInteger(dom) && dom >= 1 && dom <= 31)) return setError('Day of the month: 1–31.')
    if (kind === 'planned' && !date) return setError('Pick the day.')
    const values = {
      kind,
      name,
      amount: value,
      dayOfMonth: kind === 'planned' ? null : dom,
      date: kind === 'planned' ? date : null,
      categoryId: plan?.categoryId ?? null,
    }
    if (plan) await updateMoneyPlan(plan, values)
    else await addMoneyPlan(values)
    closeSheet()
    toast(plan ? 'Updated' : `Added “${name.trim()}”`)
  }

  async function remove() {
    if (!plan) return
    await setMoneyPlanDeleted(plan, true)
    closeSheet()
    toast(`Removed “${plan.name}”`, { label: 'Undo', run: () => void setMoneyPlanDeleted({ ...plan, deletedAt: 'x' }, false) })
  }

  /** Paid / received: log it as a real entry (the forecast then skips today's occurrence). */
  async function logIt() {
    if (!plan) return
    await logMoney({
      kind: plan.kind === 'income' ? 'income' : 'expense',
      title: plan.name,
      amount: plan.amount,
      categoryId: plan.categoryId,
      occurredAt: new Date().toISOString(),
      note: null,
    })
    if (plan.kind === 'planned') await updateMoneyPlan(plan, { archived: true })
    closeSheet()
    toast(`Logged ${plan.name} · ${formatMoney(plan.amount, settings.currency)}`)
  }

  return (
    <Sheet
      open
      onClose={closeSheet}
      title={plan ? 'Edit plan' : 'Add to money plan'}
      footer={<SheetFooter form={FORM} onDelete={plan ? () => void remove() : undefined} />}
    >
      <form
        id={FORM}
        className="form"
        onSubmit={(e) => {
          e.preventDefault()
          void save()
        }}
      >
        {!plan && <Segmented label="Kind" options={KINDS} value={kind} onChange={setKind} />}
        <label className="field">
          <span className="field-label">Name</span>
          <input
            className="input"
            autoComplete="off"
            maxLength={80}
            data-autofocus={plan ? undefined : ''}
            placeholder={PLACEHOLDER[kind]}
            value={name}
            onChange={(e) => {
              setName(e.target.value)
              setError(null)
            }}
          />
        </label>
        <div className="pair">
          <label className="field">
            <span className="field-label">Amount ({settings.currency})</span>
            <input className="input num" inputMode="decimal" autoComplete="off" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </label>
          {kind === 'planned' ? (
            <label className="field">
              <span className="field-label">On</span>
              <input className="input input-date" type="date" value={date ?? ''} onChange={(e) => setDate(e.target.value)} />
            </label>
          ) : (
            <label className="field">
              <span className="field-label">Day of month</span>
              <input className="input num" inputMode="numeric" autoComplete="off" placeholder="10" value={day} onChange={(e) => setDay(e.target.value.replace(/\D/g, '').slice(0, 2))} />
            </label>
          )}
        </div>
        {kind !== 'planned' && <p className="field-hint">Repeats every month. Short months use their last day.</p>}
        {plan && (
          <button type="button" className="btn btn-quiet" onClick={() => void logIt()}>
            {plan.kind === 'income' ? 'Received — log it now' : 'Paid — log it now'}
          </button>
        )}
        {error && <p className="field-error">{error}</p>}
      </form>
    </Sheet>
  )
}

/** "What do I have right now?" — the anchor every forecast starts from. */
export function BalanceSheet({ current }: { current: number | null }) {
  const settings = useSettings()
  const today = useToday(settings)
  const [amount, setAmount] = useState(current != null ? String(Math.round(current)) : '')
  const [error, setError] = useState<string | null>(null)

  async function save() {
    const value = parseDecimal(amount.replace(/[\s,]/g, ''))
    if (value == null) return setError('Enter what you have now (0 or more).')
    await setBalance(value, today)
    closeSheet()
    toast(`Balance set to ${formatMoney(value, settings.currency)}`)
  }

  return (
    <Sheet open onClose={closeSheet} title="Balance now" footer={<SheetFooter form="balance-form" />}>
      <form
        id="balance-form"
        className="form"
        onSubmit={(e) => {
          e.preventDefault()
          void save()
        }}
      >
        <label className="field">
          <span className="field-label">Everything you have right now ({settings.currency})</span>
          <input
            className="input num"
            inputMode="decimal"
            autoComplete="off"
            data-autofocus=""
            value={amount}
            onChange={(e) => {
              setAmount(e.target.value)
              setError(null)
            }}
          />
        </label>
        <p className="field-hint">Cash and card together. From here on, what you log moves it — set it again whenever it drifts.</p>
        {error && <p className="field-error">{error}</p>}
      </form>
    </Sheet>
  )
}
