// The Bots page (experiment `bots`): one row per bot rather than one per
// thread. A list of bots under Business and Personal with the pinned ones
// on top, the chosen bot's chat beside it, and on a wide window a pane of
// details. The chat is the website's own thread view, handed in by App.tsx
// (`thread`), so reading, sending and answering cards work as they do
// everywhere else. Which projects are bots, and the rest of the rules, are
// bots.ts.
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { useMutation, useQueries } from 'convex/react';
import { api } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';
import { useLiveQuery, usePageAway } from './live';
import { useInbox } from './inbox';
import { CommandState } from './command-state';
import { go } from './route';
import { ago } from './format';
import { allBots, botPath, buildBots, COLORS, isLive, readBotId, threadsOf, type Bot, type BotProject } from './bots';
import { Avatar } from './bots-avatar';
import * as Icon from './icons';
import './bots.css';

const PANE_KEY = 'threadbear.botsDetails';
// How many of a bot's chats the details pane lists.
const RECENT = 12;

// Every project whole, as which ones are bots is in their folders and the
// list (phone:projects) leaves those out. One small query each, which
// re-runs only when that project changes, and only while this page shows.
function useProjects(token: string): BotProject[] | undefined {
  const heads = useLiveQuery(api.phone.projects, { token });
  const away = usePageAway();
  const asks = useMemo(() => Object.fromEntries((away ? [] : (heads ?? [])).map((p) => [`${p.runnerId}/${p.id}`, { query: api.phone.project, args: { token, runnerId: p.runnerId, id: p.id } }])), [heads, away, token]);
  const answers = useQueries(asks) as Record<string, BotProject | null | Error | undefined>;
  // The last answer for each, so nothing goes while the page is away.
  const known = useRef(new Map<string, BotProject | null>());
  for (const [key, value] of Object.entries(answers)) {
    if (value instanceof Error) known.current.set(key, null);
    else if (value !== undefined) known.current.set(key, value);
  }
  if (!heads) return undefined;
  const keys = heads.map((p) => `${p.runnerId}/${p.id}`);
  // Nothing until every project has answered, so rows don't arrive one by one.
  if (!keys.every((k) => known.current.has(k))) return undefined;
  return keys.flatMap((k) => known.current.get(k) ?? []);
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

export function BotsPage({ token, id, thread }: { token: string; id?: string; thread: (threadId: string, back: string) => ReactNode }) {
  const { botId, threadId: asked } = readBotId(id);
  const projects = useProjects(token);
  const inbox = useInbox();
  const asleep = useLiveQuery(api.phone.threads, { token, view: 'hibernating' });
  const [pane, setPane] = useState(() => localStorage.getItem(PANE_KEY) !== '0');
  useTick();

  const threads = useMemo(() => [...(inbox ?? []), ...(asleep ?? [])], [inbox, asleep]);
  const lists = useMemo(() => (projects && inbox ? buildBots(projects, threads) : undefined), [projects, inbox, threads]);
  const bot = lists && botId ? allBots(lists).find((b) => b.id === botId) : undefined;

  // The chat that's open stays open while the bot is: its newest thread when
  // it was picked, not whichever becomes newest while you're typing. It
  // moves on only once that thread is put away.
  const held = useRef<{ bot?: string; thread?: string }>({});
  if (held.current.bot !== botId) held.current = { bot: botId };
  if (bot) {
    const live = new Set(threadsOf(bot, threads).filter(isLive).map((t) => t.threadId));
    if (!held.current.thread || !live.has(held.current.thread)) held.current.thread = bot.threadId;
  }
  const open = asked ?? held.current.thread;

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
          {!lists ? (
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
            </>
          )}
        </nav>
      </aside>
      {bot ? (
        <section className={`bots-main ${tint(bot).className}`} style={tint(bot).style}>
          <button className="bots-island" onClick={togglePane} title={pane ? 'Hide the details' : 'Show the details'}>
            <Avatar look={bot.look} size={24} />
            <span>{bot.title}</span>
          </button>
          {open ? thread(open, botPath()) : <NoChat key={bot.id} token={token} bot={bot} />}
        </section>
      ) : (
        <section className="bots-main">
          <BackBar />
          <div className="bots-blank">{!lists ? 'Loading…' : botId ? 'That bot has gone.' : count ? 'Pick a bot.' : ''}</div>
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

// A bot with no open chat: say so, and start one in its folder.
function NoChat({ token, bot }: { token: string; bot: Bot }) {
  const create = useMutation(api.phone.create);
  const [text, setText] = useState('');
  const [pending, setPending] = useState<Id<'commands'> | null>(null);
  const command = useLiveQuery(api.phone.command, pending ? { token, commandId: pending } : 'skip');
  // The runner makes the thread, so it has an id once it's taken the command.
  useEffect(() => {
    if (command?.threadId) go(botPath(bot.id, command.threadId));
  }, [command?.threadId, bot.id]);
  const submit = async () => {
    const body = text.trim();
    if (!body || pending) return;
    setPending(await create({ token, text: body, cwd: bot.folder, runnerId: bot.runnerId }));
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
              <button className="send" disabled={!text.trim() || !!pending} aria-label="Start the chat" title="Start the chat">
                <Icon.Up />
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
