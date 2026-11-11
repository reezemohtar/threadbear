// A bot's avatar: a robot head, this fork's own drawing (the Bots design,
// round 7, picked by Reeze on 11 Nov 2026). Something on top, a head, a dark
// visor with light eyes and a small mouth, on a 48 by 48 grid. Not based on
// any other product's artwork.
import type { ReactNode } from 'react';
import { COLORS, type Look } from './bots';

// Each part in colour `c`.
const TOP: Record<Look['top'], (c: string) => ReactNode> = {
  antenna: (c) => (
    <>
      <path d="M24 3v6" stroke={c} strokeWidth="3" strokeLinecap="round" />
      <circle cx="24" cy="3.5" r="2.8" fill={c} />
    </>
  ),
  pods: (c) => (
    <>
      <rect x="5" y="15" width="5" height="12" rx="2.5" fill={c} />
      <rect x="38" y="15" width="5" height="12" rx="2.5" fill={c} />
    </>
  ),
  feelers: (c) => <path d="M15 9 12 3M33 9l3-6" stroke={c} strokeWidth="3" strokeLinecap="round" />,
  none: () => null,
};

const HEAD: Record<Look['head'], (c: string) => ReactNode> = {
  square: (c) => <rect x="8" y="9" width="32" height="32" rx="11" fill={c} />,
  wide: (c) => <rect x="7" y="11" width="34" height="29" rx="14.5" fill={c} />,
  dome: (c) => <path d="M10 20a14 14 0 0 1 28 0v12a8 8 0 0 1-8 8H18a8 8 0 0 1-8-8z" fill={c} />,
};

// The visor's band in `band`, its eyes in `eye`.
const VISOR: Record<Look['visor'], (band: string, eye: string) => ReactNode> = {
  round: (band, eye) => (
    <>
      <rect x="13" y="18" width="22" height="11" rx="5.5" fill={band} />
      <circle cx="19.5" cy="23.5" r="2" fill={eye} />
      <circle cx="28.5" cy="23.5" r="2" fill={eye} />
    </>
  ),
  bar: (band, eye) => (
    <>
      <rect x="13" y="17" width="22" height="12" rx="4" fill={band} />
      <rect x="17" y="21.5" width="5" height="3" rx="1.5" fill={eye} />
      <rect x="26" y="21.5" width="5" height="3" rx="1.5" fill={eye} />
    </>
  ),
  smile: (band, eye) => (
    <>
      <rect x="12" y="19" width="24" height="9" rx="4.5" fill={band} />
      <path d="M17 24.5q2.5-3 5 0M26 24.5q2.5-3 5 0" fill="none" stroke={eye} strokeWidth="1.8" strokeLinecap="round" />
    </>
  ),
};

export function Avatar({ look, size = 36 }: { look: Look; size?: number }) {
  // A black bot is the page's ink, so its head turns with the theme, and its
  // visor is whichever of light and dark shows on that head (bots.css).
  const black = look.color === 'black';
  const body = black ? 'var(--b-black)' : COLORS[look.color];
  const band = black ? 'var(--b-visor)' : '#16181d';
  const eye = black ? 'var(--b-eye)' : '#ffffff';
  return (
    <svg className="bot-avatar" width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
      {TOP[look.top](body)}
      {HEAD[look.head](body)}
      {VISOR[look.visor](band, eye)}
      <rect x="20" y="33" width="8" height="2.4" rx="1.2" fill={band} opacity="0.55" />
    </svg>
  );
}

// The rail's icon for the page: a small robot head, in the site's line style.
export function BotsIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M8 1.6v2" />
      <rect x="2.8" y="3.8" width="10.4" height="9.4" rx="3.2" />
      <path d="M6 8.2v.6M10 8.2v.6" />
    </svg>
  );
}
