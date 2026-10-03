import { useState, type FormEvent } from 'react'
import { supabase } from '../data/supabase'

/** Shown once per device. Password (not magic link): links open in Safari,
 *  not the installed app, so the PWA would never receive the session. */
export function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setPending(true)
    setError(null)
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    setPending(false)
    if (error) setError(navigator.onLine ? 'Email or password is wrong.' : 'No connection. Sign-in needs internet once.')
  }

  return (
    <main className="main login">
      <form className="form" onSubmit={submit}>
        <div>
          <h1 className="login-title">Buddy</h1>
          <p className="login-sub">Log once. See your days clearly.</p>
        </div>
        <label className="field">
          <span className="field-label">Email</span>
          <input
            className="input"
            type="email"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label className="field">
          <span className="field-label">Password</span>
          <input
            className="input"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        {error && (
          <p className="field-error" role="alert">
            {error}
          </p>
        )}
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </main>
  )
}
