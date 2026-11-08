import { Component, type ErrorInfo, type ReactNode } from 'react';
import { flushSave } from '../store';

/** If anything in the UI crashes, show a calm message instead of a white page. The story itself is already autosaved. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('StoryBox crashed:', error, info.componentStack);
    try { flushSave(); } catch { /* nothing more we can do */ }
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="crash" role="alert">
        <h1>Oops, something went wrong 😟</h1>
        <p>Your stories are safe: they are saved in this browser as you work. Press the button to start StoryBox again.</p>
        <button className="btn primary big" onClick={() => location.reload()}>Start again</button>
        <details>
          <summary>Technical details (for a grown-up)</summary>
          <pre>{String(this.state.error.stack ?? this.state.error.message)}</pre>
        </details>
      </div>
    );
  }
}
