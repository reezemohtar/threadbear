// The Bots page, fetched only when it's opened, so nobody else loads it. If
// that fetch fails (offline, or the site was updated since this tab opened
// and the file it wants has gone), React keeps the failure and would show it
// again every time Bots is opened, so this offers the one thing that fixes
// it: loading the site again.
import { Component, lazy, Suspense, type ComponentProps, type ReactNode } from 'react';
import { ConvexError } from 'convex/values';
import { go } from './route';

const Page = lazy(() => import('./bots-page').then((m) => ({ default: m.BotsPage })));

class Recover extends Component<{ children: ReactNode }, { error: unknown }> {
  state = { error: null as unknown };
  static getDerivedStateFromError(error: unknown) {
    return { error: error ?? new Error('unknown') };
  }
  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    // The backend's own errors (signed out, no such thread) are the site's to show.
    if (error instanceof ConvexError) throw error;
    return (
      <div className="bots-failed" role="alert">
        <h1>The Bots page didn’t load</h1>
        <p className="muted">The connection may have dropped, or the site was updated since this tab was opened.</p>
        <p>
          <button className="btn primary" title="Load the site again" onClick={() => location.reload()}>
            Reload
          </button>{' '}
          <button className="btn" title="Go to the threads list" onClick={() => go('/')}>
            Back to the threads
          </button>
        </p>
      </div>
    );
  }
}

export function LazyBots(props: ComponentProps<typeof Page>) {
  return (
    <Recover>
      <Suspense fallback={<div className="pad muted">Loading…</div>}>
        <Page {...props} />
      </Suspense>
    </Recover>
  );
}
