import { useLiveQuery } from './ui/live'
import { memo, useEffect, useLayoutEffect, useState } from 'react'
import type { ID } from './core/types'
import { db } from './data/db'
import { ensureDefaults } from './data/repo'
import { ensureExerciseLibrary } from './data/repo-training'
import { startAutoSync, syncNow } from './data/sync'
import { ActivitySheet } from './features/ActivitySheet'
import { CheckinSheet } from './features/CheckinSheet'
import { FoodEditorSheet } from './features/FoodEditorSheet'
import { FoodSheet } from './features/FoodSheet'
import { PlanItemSheet } from './features/PlanItemSheet'
import { MoneySheet } from './features/MoneySheet'
import { QuickAddSheet } from './features/QuickAddSheet'
import { ExerciseSheet } from './features/ExerciseSheet'
import { ExportSheet } from './features/ExportSheet'
import { RecipeSheet } from './features/RecipeSheet'
import { TemplateSheet } from './features/TemplateSheet'
import { TrackerDefSheet, TrackerLogSheet } from './features/TrackerSheets'
import { WorkoutStartSheet } from './features/WorkoutStartSheet'
import { WorkoutSummarySheet } from './features/WorkoutSummary'
import { SleepSheet } from './features/SleepSheet'
import { WeightSheet } from './features/WeightSheet'
import { History } from './screens/History'
import { Login } from './screens/Login'
import { Me } from './screens/Me'
import { MeAnalyst } from './screens/MeAnalyst'
import { MeFoods } from './screens/MeFoods'
import { MeTargets } from './screens/MeTargets'
import { MeTrackers } from './screens/MeTrackers'
import { MeTraining } from './screens/MeTraining'
import { BodyDetail } from './screens/BodyDetail'
import { Money } from './screens/Money'
import { Nutrition } from './screens/Nutrition'
import { Plan } from './screens/Plan'
import { Training } from './screens/Training'
import { Workout } from './screens/Workout'
import { Today } from './screens/Today'
import { navigate, useKeyboardInset, usePath, useSession } from './ui/hooks'
import { Icon, type IconName } from './ui/icons'
import { Pager, scrollPageTop } from './ui/Pager'
import { openSheet, useSheet } from './ui/sheets'
import { StackLayer, type StackRoute } from './ui/Stack'
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
const RIGHT: Tab[] = [
  { path: '/plan', label: 'Plan', icon: 'plan' },
  { path: '/me', label: 'Me', icon: 'me' },
]

/** The tab pages, in tab-bar order (the + sits between History and Plan). */
const TABS: Tab[] = [...LEFT, ...RIGHT]
const TAB_SCREENS = [Today, History, Plan, Me]

/** Memoised: navigating must not re-render the four mounted tab screens (they read their own data). */
const TabPage = memo(function TabPage({ index }: { index: number }) {
  const Screen = TAB_SCREENS[index]
  return (
    <main className="main">
      <Screen />
    </main>
  )
})
const TAB_PAGES = TAB_SCREENS.map((_, i) => <TabPage key={i} index={i} />)

const page = (Screen: () => React.ReactNode, full = false) => () => (
  <main className={full ? 'main main-full' : 'main'}>
    <Screen />
  </main>
)

/** Screens pushed above the tabs. */
const STACK: Record<string, StackRoute> = {
  '/nutrition': { render: page(Nutrition), parent: '/' },
  '/money': { render: page(Money), parent: '/' },
  '/sleep': { render: page(() => <BodyDetail kind="sleep" />), parent: '/' },
  '/weight': { render: page(() => <BodyDetail kind="weight" />), parent: '/' },
  '/activity': { render: page(() => <BodyDetail kind="activity" />), parent: '/' },
  '/training': { render: page(Training), parent: '/' },
  '/me/targets': { render: page(MeTargets), parent: '/me' },
  '/me/foods': { render: page(MeFoods), parent: '/me' },
  '/me/training': { render: page(MeTraining), parent: '/me' },
  '/me/trackers': { render: page(MeTrackers), parent: '/me' },
  '/me/analyst': { render: page(MeAnalyst), parent: '/me' },
  '/workout': { render: page(Workout, true), parent: null, modal: true },
}

const tabIndexOf = (path: string) => {
  const i = TABS.findIndex((t) => t.path === path)
  return i >= 0 ? i : null
}
/** The tab a pushed screen belongs to when the app opens straight onto it. */
const homeTabOf = (path: string) => (path.startsWith('/me') ? 3 : 0)

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
    void syncNow().finally(() => {
      void ensureDefaults()
      void ensureExerciseLibrary()
    })
    return startAutoSync()
  }, [userId])

  // The pager stays on the tab you came from while a screen is pushed on top.
  const [tabIndex, setTabIndex] = useState(() => tabIndexOf(path) ?? homeTabOf(path))
  useLayoutEffect(() => {
    const i = tabIndexOf(path)
    if (i != null) setTabIndex(i)
  }, [path])
  const pushed = !!STACK[path]

  const tab = (t: Tab) => {
    const i = TABS.indexOf(t)
    const current = i === tabIndex
    return (
      <a
        key={t.path}
        href={t.path}
        className="tab"
        aria-current={current ? 'page' : undefined}
        onClick={(e) => {
          e.preventDefault()
          // Tapping the tab you're on scrolls it to the top (or closes a pushed screen).
          if (current && !pushed) scrollPageTop(i)
          else navigate(t.path)
        }}
      >
        <Icon name={t.icon} size={24} strokeWidth={current ? 2.1 : 1.8} />
        <span>{t.label}</span>
      </a>
    )
  }

  return (
    <div className="shell">
      <Pager
        index={tabIndex}
        covered={pushed}
        onSwipe={(i) => navigate(TABS[i].path)}
        pages={TAB_PAGES}
      />

      {path !== '/workout' && <ResumeBar />}
      <nav className="tabbar" aria-label="Main">
        <div className="tab-group">{LEFT.map(tab)}</div>
        <button type="button" className="tab tab-add" aria-label="Quick add" onClick={() => openSheet({ kind: 'quick-add' })}>
          <span className="add-disc">
            <Icon name="plus" size={24} strokeWidth={2.4} />
          </span>
        </button>
        <div className="tab-group">{RIGHT.map(tab)}</div>
      </nav>

      <StackLayer path={path} routes={STACK} onBack={navigate} />

      {sheet.kind === 'quick-add' && <QuickAddSheet />}
      {sheet.kind === 'money' && <MoneySheet key={sheet.entry?.id ?? 'new'} entry={sheet.entry} prefill={sheet.prefill} />}
      {sheet.kind === 'sleep' && <SleepSheet key={sheet.entry?.id ?? 'new'} entry={sheet.entry} />}
      {sheet.kind === 'weight' && <WeightSheet key={sheet.entry?.id ?? 'new'} entry={sheet.entry} />}
      {sheet.kind === 'activity' && <ActivitySheet key={sheet.entry?.id ?? 'new'} entry={sheet.entry} />}
      {sheet.kind === 'checkin' && <CheckinSheet key={sheet.date ?? 'today'} date={sheet.date} />}
      {sheet.kind === 'food' && <FoodSheet key={sheet.entry?.id ?? sheet.food?.id ?? 'new'} entry={sheet.entry} food={sheet.food} query={sheet.query} />}
      {sheet.kind === 'food-edit' && <FoodEditorSheet key={sheet.food?.id ?? 'new'} food={sheet.food} draft={sheet.draft} logAfter={sheet.logAfter} />}
      {sheet.kind === 'recipe' && <RecipeSheet key={sheet.food?.id ?? 'new'} food={sheet.food} />}
      {sheet.kind === 'workout-start' && <WorkoutStartSheet />}
      {sheet.kind === 'template' && <TemplateSheet key={sheet.template?.id ?? 'new'} template={sheet.template} />}
      {sheet.kind === 'workout-summary' && <WorkoutSummarySheet key={sheet.entryId} entryId={sheet.entryId} />}
      {sheet.kind === 'exercise' && <ExerciseSheet key={sheet.exerciseId} exerciseId={sheet.exerciseId} />}
      {sheet.kind === 'plan-item' && <PlanItemSheet key={sheet.item?.id ?? 'new'} item={sheet.item} planKind={sheet.planKind} />}
      {sheet.kind === 'tracker-def' && <TrackerDefSheet key={sheet.def?.id ?? 'new'} def={sheet.def} />}
      {sheet.kind === 'tracker-log' && <TrackerLogSheet key={sheet.entry?.id ?? sheet.trackerId} trackerId={sheet.trackerId} entry={sheet.entry} />}
      {sheet.kind === 'analyst-export' && <ExportSheet />}
      <Toaster />
    </div>
  )
}

/** While a workout runs, every screen offers a way back into Workout Mode. */
function ResumeBar() {
  const active = useLiveQuery(async () => {
    const id = (await db.meta.get('activeWorkout'))?.value as ID | undefined
    const e = id ? await db.entries.get(id) : undefined
    return e && !e.deletedAt ? e : null
  }, [])
  useEffect(() => {
    document.documentElement.style.setProperty('--resume-h', active ? '64px' : '0px')
  }, [active])
  if (!active) return null
  return (
    <button type="button" className="resume-bar" onClick={() => navigate('/workout')}>
      <span className="add-disc small">
        <Icon name="workout" size={18} strokeWidth={2.2} />
      </span>
      <span className="grow">
        <span className="resume-title">{active.title}</span>
        <span className="resume-sub">Workout in progress</span>
      </span>
      <span className="resume-cta">
        Resume
        <Icon name="chevronRight" size={16} strokeWidth={2.4} />
      </span>
    </button>
  )
}
