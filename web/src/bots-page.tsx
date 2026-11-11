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
import { allBots, botFolder, botPath, BOTS_FOLDED_KEY, buildBots, chatFor, COLORS, isLive, libraryChips, libraryOf, liveOf, matchBots, micHolds, namedChat, readBotId, readFoldedBots, singleFlight, slimProject, startFolder, threadsOf, toggleFolded, watchKeys, type Bot, type BotProject, type BotThread, type LibraryChip, type Section } from './bots';
import { Mic } from './bots-mic';
import type { ChatLook } from './App';
import { projectLoader } from './bots-loader';
import { Avatar } from './bots-avatar';
import * as Icon from './icons';
import './bots.css';

const PANE_KEY = 'threadbear.botsDetails';
const TAB_KEY = 'threadbear.botsPaneTab';
// How many of a bot's chats the details pane lists.
const RECENT = 12;

// How many bots are watched live for a change to their goals or folders. The
// rest keep what was read when the page opened. The selected bot is always
// one of them (watchKeys).
const WATCHED = 40;

const sameProject = (a: BotProject | null, b: BotProject | null) => JSON.stringify(a) === JSON.stringify(b);
const projectArgs = (token: string, key: string) => {
  const at = key.indexOf('/');
  return { token, runnerId: key.slice(0, at), id: key.slice(at + 1) };
};

type Projects = {
  projects: BotProject[];
  // Every project has answered, so "no bots" and "that bot has gone" can be believed.
  done: boolean;
  // How many couldn't be read, and trying those again.
  failed: number;
  retry: () => void;
  // The selected bot's project as the live query has it now (liveOf):
  // checking, known (null if it has gone) or failed. A new chat starts from
  // this, never from what was read earlier.
  live: ReturnType<typeof liveOf>;
  // Asks for the selected bot's project again, after its live query failed.
  recheck: () => void;
};

// Every project's folders and goals, as which ones are bots is in their
// folders and the list (phone:projects) leaves those out. Each is read once,
// four at a time (bots-loader.ts), and only the ones that are bots are then
// watched. What's been read stays on screen while more is read. Only the
// fields the page uses are kept (slimProject).
function useProjects(token: string, botId: string | undefined): Projects {
  const convex = useConvex();
  const heads = useLiveQuery(api.phone.projects, { token });
  const away = usePageAway();
  const [, setRead] = useState(0);
  const loader = useMemo(
    () =>
      projectLoader<BotProject>(
        async (key) => {
          const p = await convex.query(api.phone.project, projectArgs(token, key));
          return p && slimProject(p);
        },
        () => setRead((n) => n + 1),
        4,
        sameProject,
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
  const bots = [...known].flatMap(([key, p]) => (p && !p.archived && botFolder(p.folders) ? [key] : []));
  const selected = botId ? bots.find((key) => known.get(key)?.id === botId) : undefined;
  // Trying a failed watch again: it's let go for one render and then asked
  // for afresh, as a query that has failed stays failed while it's held.
  const [letGo, setLetGo] = useState<string>();
  useEffect(() => {
    if (letGo) setLetGo(undefined);
  }, [letGo]);
  const watchKey = away
    ? ''
    : watchKeys(selected, bots, WATCHED)
        .filter((key) => key !== letGo)
        .join('\n');
  const watching = useMemo(() => {
    const out: Record<string, { query: typeof api.phone.project; args: ReturnType<typeof projectArgs> }> = {};
    for (const key of watchKey ? watchKey.split('\n') : []) out[key] = { query: api.phone.project, args: projectArgs(token, key) };
    return out;
  }, [watchKey, token]);
  const fresh = useQueries(watching) as Record<string, BotProject | null | Error | undefined>;
  useEffect(() => {
    for (const [key, value] of Object.entries(fresh)) if (value !== undefined && !(value instanceof Error)) loader.put(key, value && slimProject(value));
  }, [fresh, loader]);

  return { projects: [...known.values()].flatMap((p) => p ?? []), done: !!heads && loader.done(), failed: loader.failed().length, retry: loader.retry, live: liveOf(selected ? fresh[selected] : undefined), recheck: () => setLetGo(selected) };
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

export function BotsPage({ token, id, thread }: { token: string; id?: string; thread: (threadId: string, back: string, chat: ChatLook) => ReactNode }) {
  const { botId, threadId: asked } = readBotId(id);
  const { projects, done, failed, retry, live, recheck } = useProjects(token, botId);
  const inbox = useInbox();
  const asleep = useLiveQuery(api.phone.threads, { token, view: 'hibernating' });
  const [pane, setPane] = useState(() => localStorage.getItem(PANE_KEY) !== '0');
  // The list's own controls: a search that cuts it down as you type, and
  // which sections are folded (kept in this browser).
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState('');
  const [folded, setFolded] = useState(() => readFoldedBots(localStorage.getItem(BOTS_FOLDED_KEY)));
  const fold = (which: Section) => {
    const next = toggleFolded(folded, which);
    localStorage.setItem(BOTS_FOLDED_KEY, JSON.stringify([...next]));
    setFolded(next);
  };
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

  // A chat named in the address ("/bots/<bot>~<thread>") is shown only while
  // it's this bot's, judged from its row as it is now (namedChat). An
  // archived one isn't in the lists, so its row is watched: if it's moved to
  // another project while it's open here, it stops being shown under this
  // bot's name. Asked for with useQueries, which hands back an error (no such
  // thread) rather than throwing it.
  const listed = asked ? threads.find((t) => t.threadId === asked) : undefined;
  const lookFor = asked && ready && !listed ? asked : undefined;
  const looking = useMemo<Record<string, { query: typeof api.phone.threadRow; args: { token: string; threadId: string } }>>(() => {
    const out: Record<string, { query: typeof api.phone.threadRow; args: { token: string; threadId: string } }> = {};
    if (lookFor) out.row = { query: api.phone.threadRow, args: { token, threadId: lookFor } };
    return out;
  }, [lookFor, token]);
  const looked = (useQueries(looking) as { row?: ThreadRow | Error }).row;
  // Undefined: not known yet. Null: no such thread.
  const askedRow = !asked ? undefined : (listed ?? (looked instanceof Error ? null : looked));
  const named = bot && asked ? namedChat(bot, askedRow) : 'checking';
  const open = asked ? (named === 'ok' ? asked : undefined) : newest;
  const openRow = asked ? (open ? (askedRow ?? undefined) : undefined) : threads.find((t) => t.threadId === open);

  const togglePane = () => {
    localStorage.setItem(PANE_KEY, pane ? '0' : '1');
    setPane(!pane);
  };
  const count = lists ? allBots(lists).length : 0;
  const shown = lists ? matchBots(lists, query) : undefined;
  // While searching, every section is open: a match mustn't hide in a fold.
  const section = (which: Section, title: string, bots: Bot[]) => {
    const shut = folded.has(which) && !query.trim();
    return bots.length ? (
      <>
        <button className={`bots-head ${shut ? 'folded' : ''}`} aria-expanded={!shut} title={shut ? `Show ${title}` : `Hide ${title}`} onClick={() => fold(which)}>
          {title}
          <b>{bots.length}</b>
          <Icon.ChevronDown />
        </button>
        {shut ? null : (
          <div className="bots-rows">
            {bots.map((b) => (
              <BotRow key={b.id} bot={b} on={b.id === botId} />
            ))}
          </div>
        )}
      </>
    ) : null;
  };

  return (
    <div className={`bots ${botId ? 'has-bot' : ''}`}>
      <aside className="bots-list">
        <header className="bots-bar">
          {searching ? (
            <div className="bots-search">
              <Icon.Search />
              <input
                autoFocus
                type="text"
                value={query}
                placeholder="Search bots"
                aria-label="Search bots"
                spellCheck={false}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key !== 'Escape') return;
                  setQuery('');
                  setSearching(false);
                }}
              />
            </div>
          ) : (
            <h1>Bots</h1>
          )}
          <button
            className={`bots-round ${searching ? 'on' : ''}`}
            title={searching ? 'Close the search' : 'Search bots'}
            aria-label={searching ? 'Close the search' : 'Search bots'}
            onClick={() => {
              setQuery('');
              setSearching(!searching);
            }}
          >
            {searching ? <Icon.Close /> : <Icon.Search />}
          </button>
        </header>
        <nav className="bots-scroll" aria-label="Bots">
          {lists && !count && !done && failed ? (
            <Unread count={failed} retry={retry} />
          ) : !lists || (!count && !done) ? (
            <div className="bots-note">Loading…</div>
          ) : !count ? (
            <div className="bots-note">No bots yet. A project is a bot when one of its folders is inside a folder named bots.</div>
          ) : (
            <>
              {shown!.pinned.length ? (
                <div className="bots-strip">
                  {shown!.pinned.map((b) => (
                    <BotTile key={b.id} bot={b} on={b.id === botId} />
                  ))}
                </div>
              ) : null}
              {section('business', 'Business', shown!.business)}
              {section('personal', 'Personal', shown!.personal)}
              {query.trim() && !allBots(shown!).length ? <div className="bots-note">No bots match.</div> : null}
              {done ? null : failed ? <Unread count={failed} retry={retry} /> : <div className="bots-note">Looking for more…</div>}
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
            thread(open, botPath(), { name: bot.title, tools: ({ add, hold }) => <Mic onText={add} onState={(state) => hold(micHolds(state))} /> })
          ) : asked ? (
            <NotItsChat bot={bot} checking={named === 'checking'} />
          ) : (
            <NoChat key={bot.id} token={token} bot={bot} live={live} recheck={recheck} />
          )}
        </section>
      ) : (
        <section className="bots-main">
          <BackBar />
          <div className="bots-blank">{lists && botId && !done && failed ? <Unread count={failed} retry={retry} /> : !lists || (botId && !done) ? 'Loading…' : botId ? 'That bot has gone.' : count ? 'Pick a bot.' : ''}</div>
        </section>
      )}
      {bot && pane ? <Pane token={token} bot={bot} threads={threads} open={open} close={togglePane} /> : null}
    </div>
  );
}

// Some projects couldn't be read, so which of them are bots isn't known: say
// that, rather than that there are none.
function Unread({ count, retry }: { count: number; retry: () => void }) {
  return (
    <div className="bots-note" role="alert">
      {count === 1 ? 'One project couldn’t be read' : `${count} projects couldn’t be read`}, so some bots may be missing.{' '}
      <button className="linkish" title="Read those projects again" onClick={retry}>
        Try again
      </button>
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
    <a className={`bot-row ${on ? 'on' : ''}`} href={botPath(bot.id)} title={[bot.role || bot.title, bot.at ? `active ${ago(bot.at)}` : ''].filter(Boolean).join(', ')} onClick={openBot(bot)}>
      <span className="bot-av">
        <Avatar look={bot.look} size={36} />
        <Dot bot={bot} />
      </span>
      <span className="bot-text">
        <span className="bot-top">
          <span className="bot-name">{bot.title}</span>
        </span>
        <span className={`bot-line ${bot.status}`}>{bot.line}</span>
      </span>
      {bot.unread ? (
        <i className="bot-unread" role="img" aria-label={bot.unread === 1 ? '1 unread chat' : `${bot.unread} unread chats`} title={bot.unread === 1 ? '1 unread chat' : `${bot.unread} unread chats`} />
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

// A bot with no open chat: say so, and start one in its folder. The folder
// and runner are the project's as the live query has them now (`live`,
// startFolder), not as read when the page opened: until that has answered,
// and if the project is no longer a bot, nothing can be started.
function NoChat({ token, bot, live, recheck }: { token: string; bot: Bot; live: ReturnType<typeof liveOf>; recheck: () => void }) {
  const create = useMutation(api.phone.create);
  const [text, setText] = useState('');
  const [starting, setStarting] = useState(false);
  // The mic holds Send while words are still on their way.
  const [held, setHeld] = useState(false);
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
  const start = useMemo(() => singleFlight((body: string, cwd: string, runnerId: string) => create({ token, text: body, cwd, runnerId })), [create, token]);
  const project = live.state === 'known' ? live.project : undefined;
  const folder = startFolder(project);
  const busy = starting || !!pending;
  const submit = async () => {
    const body = text.trim();
    if (!body || busy || !project || !folder || held) return;
    setStarting(true);
    setError('');
    try {
      const made = await start(body, folder, project.runnerId);
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
        {live.state === 'failed' ? (
          <>
            <p className="quiet" role="alert">
              No open chat. This bot’s folder couldn’t be checked, so one can’t be started yet.
            </p>
            <p>
              <button className="btn" title="Check this bot's folder again" onClick={recheck}>
                Try again
              </button>
            </p>
          </>
        ) : (
          <p className="quiet">{live.state === 'checking' ? 'No open chat. Checking this bot’s folder…' : folder ? 'No open chat. Send a message to start one.' : 'No open chat, and this project no longer has a folder inside a bots folder, so one can’t be started here.'}</p>
        )}
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
              <Mic onText={(said) => setText((typed) => (typed.trim() ? `${typed.replace(/\s+$/, '')} ${said}` : said))} onState={(state) => setHeld(micHolds(state))} />
              <button className="send" disabled={!text.trim() || busy || !folder || held} aria-label="Start the chat" title={busy ? 'Starting the chat' : folder ? `Start the chat in ${folder}` : live.state === 'failed' ? 'This bot’s folder couldn’t be checked' : 'Waiting for this bot’s folder'}>
                {busy ? <span className="spinner" /> : <Icon.Up />}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

// Beside the chat on a wide window: who the bot is, then two tabs. Activity
// is its recent chats, archived ones too. Library is what the website is
// really given of the open chat's files, which today is its pictures
// (libraryOf): a chip shows only when there's something behind it.
function Pane({ token, bot, threads, open, close }: { token: string; bot: Bot; threads: Parameters<typeof threadsOf>[1]; open?: string; close: () => void }) {
  const [tab, setTab] = useState<'activity' | 'library'>(() => (localStorage.getItem(TAB_KEY) === 'library' ? 'library' : 'activity'));
  const pick = (next: 'activity' | 'library') => {
    localStorage.setItem(TAB_KEY, next);
    setTab(next);
  };
  return (
    <aside className="bots-pane" aria-label={`About ${bot.title}`}>
      <button className="bots-round bots-close" onClick={close} aria-label="Hide the details" title="Hide the details">
        <Icon.Close />
      </button>
      <div className="bots-hero">
        <Avatar look={bot.look} size={64} />
      </div>
      <h2>{bot.title}</h2>
      {bot.role ? <p className="bots-role">{bot.role}</p> : null}
      <div className="bots-tabs" role="tablist">
        <button role="tab" aria-selected={tab === 'activity'} className={`bots-tab ${tab === 'activity' ? 'on' : ''}`} title="This bot's recent chats" onClick={() => pick('activity')}>
          Activity
        </button>
        <button role="tab" aria-selected={tab === 'library'} className={`bots-tab ${tab === 'library' ? 'on' : ''}`} title="Pictures from the open chat" onClick={() => pick('library')}>
          Library
        </button>
      </div>
      {tab === 'activity' ? <Activity token={token} bot={bot} threads={threads} open={open} /> : <Library key={open ?? ''} token={token} threadId={open} />}
    </aside>
  );
}

function Activity({ token, bot, threads, open }: { token: string; bot: Bot; threads: Parameters<typeof threadsOf>[1]; open?: string }) {
  const joined = useLiveQuery(api.phone.projectThreads, { token, projectId: bot.id, limit: RECENT });
  const recent = threadsOf(bot, [...threads, ...(joined ?? [])]).slice(0, RECENT);
  return (
    <>
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
    </>
  );
}

const CHIP_WORDS: Record<LibraryChip, string> = { media: 'Media' };

function Library({ token, threadId }: { token: string; threadId?: string }) {
  const images = useLiveQuery(api.phone.images, threadId ? { token, threadId, from: 0 } : 'skip');
  const [chip, setChip] = useState<LibraryChip>();
  if (!threadId) return <div className="bots-quiet">Open a chat to see its pictures.</div>;
  if (!images) return <div className="bots-quiet">Loading…</div>;
  const library = libraryOf(images);
  const chips = libraryChips(library);
  if (!chips.length) return <div className="bots-quiet">No pictures in this chat yet. Pages and files stay on the Mac for now.</div>;
  const on = chip && chips.includes(chip) ? chip : chips[0]!;
  return (
    <>
      <div className="bots-chips">
        {chips.map((c) => (
          <button key={c} className={`bots-chip ${c === on ? 'on' : ''}`} aria-pressed={c === on} title="Every picture in this chat" onClick={() => setChip(c)}>
            {CHIP_WORDS[c]}
          </button>
        ))}
      </div>
      <div className="bots-label">From this chat</div>
      <div className="bots-card">
        {library[on].map((p, i) => (
          <a key={p.url} className="bots-li" href={p.url} target="_blank" rel="noreferrer" title="Open this picture in a new tab">
            <img className="bots-thumb" src={p.url} alt="" loading="lazy" />
            <span className="bots-li-title">Picture {library[on].length - i}</span>
          </a>
        ))}
      </div>
    </>
  );
}
