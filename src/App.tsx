import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect } from 'react'
import type { ID } from './core/types'
import { db } from './data/db'
import { ensureDefaults } from './data/repo'
import { ensureExerciseLibrary } from './data/repo-training'
import { startAutoSync, syncNow } from './data/sync'
import { ActivitySheet } from './features/ActivitySheet'
import { CheckinSheet } from './features/CheckinSheet'
import { FoodEditorSheet } from './features/FoodEditorSheet'
import { FoodSheet } from './features/FoodSheet'
import { MoneySheet } from './features/MoneySheet'
import { QuickAddSheet } from './features/QuickAddSheet'
import { ExerciseSheet } from './features/ExerciseSheet'
import { RecipeSheet } from './features/RecipeSheet'
import { TemplateSheet } from './features/TemplateSheet'
import { WorkoutStartSheet } from './features/WorkoutStartSheet'
import { WorkoutSummarySheet } from './features/WorkoutSummary'
import { SleepSheet } from './features/SleepSheet'
import { WeightSheet } from './features/WeightSheet'
import { History } from './screens/History'
import { Login } from './screens/Login'
import { Me } from './screens/Me'
import { MeFoods } from './screens/MeFoods'
import { MeTargets } from './screens/MeTargets'
import { MeTraining } from './screens/MeTraining'
import { Nutrition } from './screens/Nutrition'
import { Training } from './screens/Training'
import { Workout } from './screens/Workout'
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
  '/me/foods': MeFoods,
  '/nutrition': Nutrition,
  '/training': Training,
  '/me/training': MeTraining,
  '/workout': Workout,
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
    void syncNow().finally(() => {
      void ensureDefaults()
      void ensureExerciseLibrary()
    })
    return startAutoSync()
  }, [userId])

  const Screen = ROUTES[path] ?? Today
  // A sub-screen keeps its parent tab highlighted.
  const section = '/' + (path.split('/')[1] ?? '')
  // Workout Mode takes the whole screen.
  const fullscreen = path === '/workout'

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
      <main className={fullscreen ? 'main main-full' : 'main'}>
        <Screen />
      </main>

      {!fullscreen && (
        <>
          <ResumeBar />
          <nav className="tabbar" aria-label="Main">
            <div className="tab-group">{LEFT.map(tab)}</div>
            <button type="button" className="tab tab-add" aria-label="Quick add" onClick={() => openSheet({ kind: 'quick-add' })}>
              <span className="add-disc">
                <Icon name="plus" size={24} strokeWidth={2.4} />
              </span>
            </button>
            <div className="tab-group">{RIGHT.map(tab)}</div>
          </nav>
        </>
      )}

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
      <Toaster />
    </>
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
