// The Bots page, fetched only when it's opened, so nobody else loads it. If
// that fetch fails (offline, or the site was updated since this tab opened
// and the file it wants has gone), React keeps the failure and would show it
// again every time Bots is opened, so this offers the one thing that fixes
// it: loading the site again. Its look is written here, not in bots.css:
// that file comes with the page, so it may be what didn't arrive.
import { Component, lazy, Suspense, type ComponentProps, type CSSProperties, type ReactNode } from 'react';
import { ConvexError } from 'convex/values';
import { isLoadFailure } from './bots';
import { go } from './route';

const Page = lazy(() => import('./bots-page').then((m) => ({ default: m.BotsPage })));

const COVER: CSSProperties = { position: 'fixed', inset: 0, zIndex: 20, display: 'grid', placeContent: 'center', justifyItems: 'center', gap: 8, padding: 24, textAlign: 'center', background: 'var(--bg)', color: 'var(--text)' };
const TITLE: CSSProperties = { margin: 0, fontSize: 22 };
const WORDS: CSSProperties = { margin: 0, maxWidth: 440 };
const BUTTONS: CSSProperties = { display: 'flex', gap: 8, marginTop: 8 };

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
    const load = isLoadFailure(error);
    return (
      <div role="alert" style={COVER}>
        <h1 style={TITLE}>{load ? 'The Bots page didn’t load' : 'Something went wrong on the Bots page'}</h1>
        <p className="muted" style={WORDS}>
          {load ? 'The connection may have dropped, or the site was updated since this tab was opened.' : String(error instanceof Error ? error.message : error)}
        </p>
        <div style={BUTTONS}>
          <button className="btn primary" title="Load the site again" onClick={() => location.reload()}>
            Reload
          </button>
          <button className="btn" title="Go to the threads list" onClick={() => go('/')}>
            Back to the threads
          </button>
        </div>
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
