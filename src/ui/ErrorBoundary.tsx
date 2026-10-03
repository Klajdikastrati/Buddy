import { Component, type ReactNode } from 'react'

/** Last line of defence: an unexpected error shows a way back instead of a blank screen. Data is local and safe. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error) {
    console.error('Buddy crashed', error)
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <main className="main login">
        <div className="form">
          <h1 className="login-title">Something went wrong</h1>
          <p className="login-sub">Nothing you logged is lost — it’s stored on this phone.</p>
          <button type="button" className="btn btn-primary" onClick={() => location.reload()}>
            Reload Buddy
          </button>
          <p className="field-hint">{this.state.error.message}</p>
        </div>
      </main>
    )
  }
}
