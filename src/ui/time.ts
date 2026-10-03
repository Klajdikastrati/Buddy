// Form inputs speak the phone's wall-clock time; storage speaks ISO instants.

const pad = (n: number) => String(n).padStart(2, '0')

/** ISO → `datetime-local` value (local wall time, no zone). */
export function toLocalInput(iso: string): string {
  const d = new Date(iso)
  return `${calendarDate(iso)}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** `datetime-local` / `YYYY-MM-DDTHH:MM` (local) → ISO. */
export function fromLocalInput(value: string): string {
  return new Date(value).toISOString()
}

/** Local calendar date of an instant, `YYYY-MM-DD`. */
export function calendarDate(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** Local `HH:MM` of an instant. */
export function timeOf(iso: string): string {
  const d = new Date(iso)
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** Local date + `HH:MM` → ISO. */
export function atLocal(date: string, time: string): string {
  return new Date(`${date}T${time}`).toISOString()
}

/** Now, rounded down to 5 minutes, as `HH:MM`. */
export function nowTime(): string {
  const d = new Date()
  return `${pad(d.getHours())}:${pad(d.getMinutes() - (d.getMinutes() % 5))}`
}
