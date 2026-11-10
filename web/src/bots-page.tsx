// The Bots page (experiment `bots`): one row per bot rather than one per
// thread. A list of bots under Business and Personal with the pinned ones
// on top, the chosen bot's chat beside it, and on a wide window a pane of
// details. The chat is the website's own thread view, handed in by App.tsx
// (`thread`), so reading, sending and answering cards work as they do
// everywhere else. Which projects are bots, and the rest of the rules, are
// bots.ts.
import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { useConvex, useMutation, useQueries } from 'convex/react';
import { api } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';
import { useLiveQuery, usePageAway } from './live';
import { useInbox } from './inbox';
import { CommandState } from './command-state';
import { go } from './route';
import { ago } from './format';
import { allBots, belongs, botFolder, botPath, buildBots, chatFor, COLORS, isLive, readBotId, singleFlight, threadsOf, type Bot, type BotProject, type BotThread } from './bots';
import { projectLoader } from './bots-loader';
import { Avatar } from './bots-avatar';
import * as Icon from './icons';
import './bots.css';

const PANE_KEY = 'threadbear.botsDetails';
// How many of a bot's chats the details pane lists.
const RECENT = 12;

// How many bots are watched live for a change to their goals or folders. The
// rest keep what was read when the page opened.
const WATCHED = 40;

// Every project's folders and goals, as which ones are bots is in their
// folders and the list (phone:projects) leaves those out. Each is read once,
// four at a time (bots-loader.ts), and only the ones that are bots are then
// watched. What's been read stays on screen while more is read. `done`: every
// project has answered, so "no bots" and "that bot has gone" can be believed.
function useProjects(token: string): { projects: BotProject[]; done: boolean } {
  const convex = useConvex();
  const heads = useLiveQuery(api.phone.projects, { token });
  const away = usePageAway();
  const [, setRead] = useState(0);
  const loader = useMemo(
    () =>
      projectLoader<BotProject>(
        (key) => {
          const at = key.indexOf('/');
          return convex.query(api.phone.project, { token, runnerId: key.slice(0, at), id: key.slice(at + 1) });
        },
        () => setRead((n) => n + 1),
      ),
    [convex, token],
  );
  useEffect(() => {
    loader.start();
    return () => loader.stop();
  }, [loader]);
  useEffect(() => {
    if (heads) loader.want(heads.map((p) => `${p.runnerId}/${p.id}`));
  }, [heads, loader]);

  const known = loader.known();
  const bots = [...known].flatMap(([key, p]) => (p && !p.archived && botFolder(p.folders) ? [key] : [])).slice(0, WATCHED);
  const watchKey = away ? '' : bots.join('\n');
  const watching = useMemo(() => {
    const out: Record<string, { query: typeof api.phone.project; args: { token: string; runnerId: string; id: string } }> = {};
    for (const key of watchKey ? watchKey.split('\n') : []) {
      const at = key.indexOf('/');
      out[key] = { query: api.phone.project, args: { token, runnerId: key.slice(0, at), id: key.slice(at + 1) } };
    }
    return out;
  }, [watchKey, token]);
  const fresh = useQueries(watching) as Record<string, BotProject | null | Error | undefined>;
  useEffect(() => {
    for (const [key, value] of Object.entries(fresh)) if (value !== undefined && !(value instanceof Error)) loader.put(key, value);
  }, [fresh, loader]);

  return { projects: [...known.values()].flatMap((p) => p ?? []), done: !!heads && loader.done() };
}

// Re-renders every half minute so "5m" stays honest between updates.
function useTick() {
  const [, setNow] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
}

// The bot's colour for its chat: your bubble, the send button and a picked
// answer (bots.css). Black is the page's ink, which turns with the theme.
function tint(bot: Bot): { className: string; style?: CSSProperties } {
  if (bot.look.color === 'black') return { className: 'ink' };
  const c = COLORS[bot.look.color];
  return { className: '', style: { '--bc': c, '--ubub': c, '--onbc': '#fff' } as CSSProperties };
}

const STATUS_WORDS = { needs: 'Needs you', working: 'Working', failed: 'The last turn failed', idle: '' } as const;

type ThreadRow = BotThread & { title: string };

export function BotsPage({ token, id, thread }: { token: string; id?: string; thread: (threadId: string, back: string) => ReactNode }) {
  const { botId, threadId: asked } = readBotId(id);
  const convex = useConvex();
  const { projects, done } = useProjects(token);
  const inbox = useInbox();
  const asleep = useLiveQuery(api.phone.threads, { token, view: 'hibernating' });
  const [pane, setPane] = useState(() => localStorage.getItem(PANE_KEY) !== '0');
  useTick();

  // Both lists of open threads, or nothing: with only one, a bot whose chat is
  // hibernating would look as if it had none, and offer to start another.
  const ready = !!inbox && !!asleep;
  const threads = useMemo<ThreadRow[]>(() => [...(inbox ?? []), ...(asleep ?? [])], [inbox, asleep]);
  const lists = useMemo(() => (ready ? buildBots(projects, threads) : undefined), [ready, projects, threads]);
  const bot = lists && botId ? allBots(lists).find((b) => b.id === botId) : undefined;

  // The chat that's open stays open while the bot is: its newest thread when
  // it was picked, not whichever becomes newest while you're typing
  // (chatFor). It moves on only once that thread is put away.
  const [held, setHeld] = useState<{ bot?: string; thread?: string }>({});
  const newest = bot ? chatFor(bot, threads, held.bot === bot.id ? held.thread : undefined) : undefined;
  useEffect(() => {
    if (bot?.id && (held.bot !== bot.id || held.thread !== newest)) setHeld({ bot: bot.id, thread: newest });
  }, [bot?.id, newest, held]);

  // A chat named in the address ("/bots/<bot>~<thread>") is shown only once
  // it's known to be this bot's. An archived one isn't in the lists, so its
  // row is read to find out.
  const listed = asked ? threads.find((t) => t.threadId === asked) : undefined;
  const [looked, setLooked] = useState<{ id: string; row: ThreadRow | null }>();
  useEffect(() => {
    if (!asked || !ready || listed) return;
    let current = true;
    convex.query(api.phone.threadRow, { token, threadId: asked }).then(
      (row) => current && setLooked({ id: asked, row }),
      () => current && setLooked({ id: asked, row: null }),
    );
    return () => {
      current = false;
    };
  }, [asked, ready, !!listed, convex, token]);
  // Undefined: not known yet. Null: no such thread.
  const askedRow = !asked ? undefined : (listed ?? (looked?.id === asked ? looked.row : undefined));
  const open = asked ? (bot && askedRow && belongs(bot, askedRow) ? asked : undefined) : newest;
  const openRow = asked ? (open ? askedRow : undefined) : threads.find((t) => t.threadId === open);

  const togglePane = () => {
    localStorage.setItem(PANE_KEY, pane ? '0' : '1');
    setPane(!pane);
  };
  const count = lists ? allBots(lists).length : 0;
  const section = (title: string, bots: Bot[]) =>
    bots.length ? (
      <>
        <div className="bots-head">
          {title}
          <b>{bots.length}</b>
        </div>
        <div className="bots-rows">
          {bots.map((b) => (
            <BotRow key={b.id} bot={b} on={b.id === botId} />
          ))}
        </div>
      </>
    ) : null;

  return (
    <div className={`bots ${botId ? 'has-bot' : ''}`}>
      <aside className="bots-list">
        <header className="bots-bar">
          <h1>Bots</h1>
        </header>
        <nav className="bots-scroll" aria-label="Bots">
          {!lists || (!count && !done) ? (
            <div className="bots-note">Loading…</div>
          ) : !count ? (
            <div className="bots-note">No bots yet. A project is a bot when one of its folders is inside a folder named bots.</div>
          ) : (
            <>
              {lists.pinned.length ? (
                <div className="bots-strip">
                  {lists.pinned.map((b) => (
                    <BotTile key={b.id} bot={b} on={b.id === botId} />
                  ))}
                </div>
              ) : null}
              {section('Business', lists.business)}
              {section('Personal', lists.personal)}
              {done ? null : <div className="bots-note">Looking for more…</div>}
            </>
          )}
        </nav>
      </aside>
      {bot ? (
        <section className={`bots-main ${tint(bot).className}`} style={tint(bot).style}>
          {/* The bot, and which of its chats this is: the thread view's own title is hidden under it. */}
          <button className="bots-island" onClick={togglePane} title={[openRow ? `${openRow.title || 'Untitled'}, in ${openRow.cwd}` : '', pane ? 'Hide the details' : 'Show the details'].filter(Boolean).join('. ')}>
            <Avatar look={bot.look} size={24} />
            <span className="bots-island-name">{bot.title}</span>
            {openRow ? <span className="bots-island-chat">{openRow.title || 'Untitled'}</span> : null}
          </button>
          {open ? (
            thread(open, botPath())
          ) : asked ? (
            <NotItsChat bot={bot} checking={askedRow === undefined} />
          ) : (
            <NoChat key={bot.id} token={token} bot={bot} />
          )}
        </section>
      ) : (
        <section className="bots-main">
          <BackBar />
          <div className="bots-blank">{!lists || (botId && !done) ? 'Loading…' : botId ? 'That bot has gone.' : count ? 'Pick a bot.' : ''}</div>
        </section>
      )}
      {bot && pane ? <Details token={token} bot={bot} threads={threads} open={open} close={togglePane} /> : null}
    </div>
  );
}

const openBot = (bot: Bot) => (e: React.MouseEvent) => {
  if (e.metaKey || e.ctrlKey) return;
  e.preventDefault();
  go(botPath(bot.id));
};

function Dot({ bot }: { bot: Bot }) {
  return bot.status === 'idle' ? null : <i className={`bot-dot ${bot.status}`} title={STATUS_WORDS[bot.status]} />;
}

function BotRow({ bot, on }: { bot: Bot; on: boolean }) {
  return (
    <a className={`bot-row ${on ? 'on' : ''}`} href={botPath(bot.id)} title={bot.role || bot.title} onClick={openBot(bot)}>
      <span className="bot-av">
        <Avatar look={bot.look} size={36} />
        <Dot bot={bot} />
      </span>
      <span className="bot-text">
        <span className="bot-top">
          <span className="bot-name">{bot.title}</span>
          {bot.at ? <span className="bot-time">{ago(bot.at)}</span> : null}
        </span>
        <span className={`bot-line ${bot.status}`}>{bot.line}</span>
      </span>
      {bot.unread ? (
        <span className="bot-badge" title={bot.unread === 1 ? '1 unread chat' : `${bot.unread} unread chats`}>
          {bot.unread}
        </span>
      ) : null}
    </a>
  );
}

function BotTile({ bot, on }: { bot: Bot; on: boolean }) {
  return (
    <a className={`bot-tile ${on ? 'on' : ''}`} href={botPath(bot.id)} title={[bot.title, STATUS_WORDS[bot.status] || bot.line].filter(Boolean).join(': ')} onClick={openBot(bot)}>
      <span className="bot-av">
        <Avatar look={bot.look} size={60} />
        <Dot bot={bot} />
      </span>
      <span className="bot-tile-name">{bot.title}</span>
    </a>
  );
}

// Back to the list, where the list and the chat take turns (a phone, a
// narrow panel). The thread view has its own.
function BackBar() {
  return (
    <header className="thread-head">
      <button className="icon-btn back" onClick={() => go(botPath())} aria-label="Back to the bots" title="Back to the bots">
        <Icon.Back />
      </button>
    </header>
  );
}

// The address names a chat that isn't this bot's (or isn't anyone's): say
// so, rather than show another bot's thread under this one's name.
function NotItsChat({ bot, checking }: { bot: Bot; checking: boolean }) {
  return (
    <div className="bots-nochat">
      <BackBar />
      <div className="bots-hello">
        {checking ? (
          <p className="quiet">Loading…</p>
        ) : (
          <>
            <Avatar look={bot.look} size={64} />
            <h2>{bot.title}</h2>
            <p className="quiet">That chat isn’t one of this bot’s.</p>
            <p>
              <button className="btn" title="Open this bot's newest chat" onClick={() => go(botPath(bot.id))}>
                Open its newest chat
              </button>
            </p>
          </>
        )}
      </div>
    </div>
  );
}

// A bot with no open chat: say so, and start one in its folder.
function NoChat({ token, bot }: { token: string; bot: Bot }) {
  const create = useMutation(api.phone.create);
  const [text, setText] = useState('');
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState('');
  const [pending, setPending] = useState<Id<'commands'> | null>(null);
  const command = useLiveQuery(api.phone.command, pending ? { token, commandId: pending } : 'skip');
  // The runner makes the thread, so it has an id once it's taken the command.
  useEffect(() => {
    if (command?.threadId) go(botPath(bot.id, command.threadId));
  }, [command?.threadId, bot.id]);
  // One at a time, held from the press itself: `pending` is only set once the
  // backend has answered, and Return pressed twice before then would
  // otherwise queue two chats.
  const start = useMemo(() => singleFlight((body: string) => create({ token, text: body, cwd: bot.folder, runnerId: bot.runnerId })), [create, token, bot.folder, bot.runnerId]);
  const busy = starting || !!pending;
  const submit = async () => {
    const body = text.trim();
    if (!body || busy) return;
    setStarting(true);
    setError('');
    try {
      const made = await start(body);
      if (made.ran) setPending(made.value);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setStarting(false);
    }
  };
  return (
    <div className="bots-nochat">
      <BackBar />
      <div className="bots-hello">
        <Avatar look={bot.look} size={64} />
        <h2>{bot.title}</h2>
        {bot.role ? <p>{bot.role}</p> : null}
        <p className="quiet">No open chat. Send a message to start one.</p>
      </div>
      <div className="dock">
        {error ? (
          <div className="command failed" role="alert">
            Couldn’t start the chat: {error}
          </div>
        ) : starting ? (
          <div className="command">Starting…</div>
        ) : null}
        {pending ? <CommandState token={token} commandId={pending} onDone={() => setPending(null)} /> : null}
        <div className="box">
          <form
            className="composer"
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
          >
            <textarea
              value={text}
              rows={Math.min(10, Math.max(1, text.split('\n').length))}
              placeholder={`Message ${bot.title}`}
              aria-label={`Message ${bot.title}`}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && !matchMedia('(pointer: coarse)').matches) {
                  e.preventDefault();
                  void submit();
                }
              }}
            />
            <div className="tools-row">
              <button className="send" disabled={!text.trim() || busy} aria-label="Start the chat" title={busy ? 'Starting the chat' : 'Start the chat'}>
                {busy ? <span className="spinner" /> : <Icon.Up />}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

// Beside the chat on a wide window: who the bot is and its recent chats,
// archived ones too.
function Details({ token, bot, threads, open, close }: { token: string; bot: Bot; threads: Parameters<typeof threadsOf>[1]; open?: string; close: () => void }) {
  const joined = useLiveQuery(api.phone.projectThreads, { token, projectId: bot.id, limit: RECENT });
  const recent = threadsOf(bot, [...threads, ...(joined ?? [])]).slice(0, RECENT);
  return (
    <aside className="bots-pane" aria-label={`About ${bot.title}`}>
      <button className="icon-btn bots-close" onClick={close} aria-label="Hide the details" title="Hide the details">
        <Icon.Close />
      </button>
      <div className="bots-hero">
        <Avatar look={bot.look} size={64} />
      </div>
      <h2>{bot.title}</h2>
      {bot.role ? <p className="bots-role">{bot.role}</p> : null}
      <div className="bots-label">Recent chats</div>
      {recent.length ? (
        <div className="bots-card">
          {recent.map((t) => (
            <a
              key={t.threadId}
              className={`bots-li ${t.threadId === open ? 'on' : ''}`}
              href={botPath(bot.id, t.threadId)}
              title={isLive(t) ? 'Open this chat' : 'Open this archived chat'}
              onClick={(e) => {
                if (e.metaKey || e.ctrlKey) return;
                e.preventDefault();
                go(botPath(bot.id, t.threadId));
              }}
            >
              <span className="bots-li-title">{t.title || 'Untitled'}</span>
              <span className="bots-li-when">{isLive(t) ? ago(t.lastActivityMs) : 'Archived'}</span>
            </a>
          ))}
        </div>
      ) : (
        <div className="bots-quiet">{joined ? 'No chats yet.' : 'Loading…'}</div>
      )}
    </aside>
  );
}
