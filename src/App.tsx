import { useEffect } from 'react'
import { ensureDefaults } from './data/repo'
import { startAutoSync, syncNow } from './data/sync'
import { ActivitySheet } from './features/ActivitySheet'
import { CheckinSheet } from './features/CheckinSheet'
import { MoneySheet } from './features/MoneySheet'
import { QuickAddSheet } from './features/QuickAddSheet'
import { SleepSheet } from './features/SleepSheet'
import { WeightSheet } from './features/WeightSheet'
import { History } from './screens/History'
import { Login } from './screens/Login'
import { Me } from './screens/Me'
import { MeTargets } from './screens/MeTargets'
import { Today } from './screens/Today'
import { navigate, useKeyboardInset, usePath, useSession } from './ui/hooks'
import { Icon, type IconName } from './ui/icons'
import { openSheet, useSheet } from './ui/sheets'
import { Toaster } from './ui/toast'

interface Tab {
  path: string
  label: string
  icon: IconName
}

// The + always sits in the centre: tabs split into a left and a right group.
const LEFT: Tab[] = [
  { path: '/', label: 'Today', icon: 'today' },
  { path: '/history', label: 'History', icon: 'history' },
]
const RIGHT: Tab[] = [{ path: '/me', label: 'Me', icon: 'me' }]

const ROUTES: Record<string, () => React.ReactNode> = {
  '/': Today,
  '/history': History,
  '/me': Me,
  '/me/targets': MeTargets,
}

export default function App() {
  const session = useSession()
  useKeyboardInset()

  if (session === undefined) return null
  if (session === null) return <Login />
  return <Shell userId={session.user.id} />
}

function Shell({ userId }: { userId: string }) {
  const path = usePath()
  const sheet = useSheet()

  useEffect(() => {
    // Pull first (a second device adopts synced categories), then fill defaults.
    // Offline, the pull fails fast and defaults are created locally.
    void syncNow().finally(() => void ensureDefaults())
    return startAutoSync()
  }, [userId])

  const Screen = ROUTES[path] ?? Today
  // A sub-screen keeps its parent tab highlighted.
  const section = '/' + (path.split('/')[1] ?? '')

  const tab = (t: Tab) => (
    <a
      key={t.path}
      href={t.path}
      className="tab"
      aria-current={section === t.path ? 'page' : undefined}
      onClick={(e) => {
        e.preventDefault()
        navigate(t.path)
      }}
    >
      <Icon name={t.icon} size={24} strokeWidth={section === t.path ? 2.1 : 1.8} />
      <span>{t.label}</span>
    </a>
  )

  return (
    <>
      <main className="main">
        <Screen />
      </main>

      <nav className="tabbar" aria-label="Main">
        <div className="tab-group">{LEFT.map(tab)}</div>
        <button type="button" className="tab tab-add" aria-label="Quick add" onClick={() => openSheet({ kind: 'quick-add' })}>
          <span className="add-disc">
            <Icon name="plus" size={24} strokeWidth={2.4} />
          </span>
        </button>
        <div className="tab-group">{RIGHT.map(tab)}</div>
      </nav>

      {sheet.kind === 'quick-add' && <QuickAddSheet />}
      {sheet.kind === 'money' && <MoneySheet key={sheet.entry?.id ?? 'new'} entry={sheet.entry} prefill={sheet.prefill} />}
      {sheet.kind === 'sleep' && <SleepSheet key={sheet.entry?.id ?? 'new'} entry={sheet.entry} />}
      {sheet.kind === 'weight' && <WeightSheet key={sheet.entry?.id ?? 'new'} entry={sheet.entry} />}
      {sheet.kind === 'activity' && <ActivitySheet key={sheet.entry?.id ?? 'new'} entry={sheet.entry} />}
      {sheet.kind === 'checkin' && <CheckinSheet key={sheet.date ?? 'today'} date={sheet.date} />}
      <Toaster />
    </>
  )
}
