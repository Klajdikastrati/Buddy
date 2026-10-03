// A workout that is being started: Workout Mode draws its frame from this at once
// (title, one placeholder per exercise) while the database write lands.

interface PendingWorkout {
  title: string
  exercises: number
  at: number
}

let pending: PendingWorkout | null = null

export function setPendingWorkout(p: { title: string; exercises: number } | null) {
  pending = p ? { ...p, at: Date.now() } : null
}

/** The workout being started, if it was asked for in the last few seconds. */
export function pendingWorkout(): PendingWorkout | null {
  return pending && Date.now() - pending.at < 3000 ? pending : null
}
