import { useEffect } from 'react'
import { ensureDefaults } from './data/repo'
import { startAutoSync, syncNow } from './data/sync'
import { MoneySheet } from './features/MoneySheet'
import { QuickAddSheet } from './features/QuickAddSheet'
import { History } from './screens/History'
import { Login } from './screens/Login'
import { Me } from './screens/Me'
import { Today } from './screens/Today'
import { navigate, useKeyboardInset, usePath, useSession } from './ui/hooks'
import { openSheet, useSheet } from './ui/sheets'
import { Toaster } from './ui/toast'

const icon = (d: string) => (
  <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={d} />
  </svg>
)

const TABS = [
  { path: '/', label: 'Today', icon: icon('M12 3v2m0 14v2M5 12H3m18 0h-2M6.3 6.3 4.9 4.9m14.2 14.2-1.4-1.4M6.3 17.7l-1.4 1.4M19.1 4.9l-1.4 1.4M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z') },
  { path: '/history', label: 'History', icon: icon('M4 6h16M4 12h16M4 18h10') },
  { path: '/me', label: 'Me', icon: icon('M16 8a4 4 0 1 1-8 0 4 4 0 0 1 8 0ZM4 21a8 8 0 0 1 16 0') },
] as const

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

  const screen = path === '/history' ? <History /> : path === '/me' ? <Me /> : <Today />

  const tab = (t: (typeof TABS)[number]) => (
    <a
      key={t.path}
      href={t.path}
      className="tab"
      aria-current={path === t.path ? 'page' : undefined}
      onClick={(e) => {
        e.preventDefault()
        navigate(t.path)
      }}
    >
      {t.icon}
      <span>{t.label}</span>
    </a>
  )

  return (
    <>
      <main className="main">{screen}</main>

      <nav className="tabbar" aria-label="Main">
        {tab(TABS[0])}
        {tab(TABS[1])}
        <button type="button" className="tab tab-add" aria-label="Quick add" onClick={() => openSheet({ kind: 'quick-add' })}>
          <span className="add-disc">{icon('M12 5v14M5 12h14')}</span>
        </button>
        {tab(TABS[2])}
      </nav>

      {sheet.kind === 'quick-add' && <QuickAddSheet />}
      {sheet.kind === 'money' && <MoneySheet key={sheet.entry?.id ?? 'new'} entry={sheet.entry} prefill={sheet.prefill} />}
      <Toaster />
    </>
  )
}
