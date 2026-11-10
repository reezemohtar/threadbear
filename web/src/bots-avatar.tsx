// A bot's avatar: one of 12 plain shapes with a white mark, in the bot's
// colour. The shapes are this fork's own drawings (round 5 of the Bots
// design), each on a 48 by 48 grid.
import type { ReactNode } from 'react';
import { COLORS, type Look, type Shape } from './bots';

// A regular polygon's corners around the middle of the grid.
function corners(n: number, r: number, turn = 0): string {
  return Array.from({ length: n }, (_, i) => `${(24 + r * Math.cos(turn + (2 * Math.PI * i) / n)).toFixed(1)},${(24 + r * Math.sin(turn + (2 * Math.PI * i) / n)).toFixed(1)}`).join(' ');
}

// Each shape's body in colour `c`, then its mark in `m`.
const DRAW: Record<Shape, (c: string, m: string) => ReactNode> = {
  circle: (c, m) => (
    <>
      <circle cx="24" cy="24" r="21" fill={c} />
      <circle cx="24" cy="24" r="7.5" fill={m} />
    </>
  ),
  squircle: (c, m) => (
    <>
      <rect x="3" y="3" width="42" height="42" rx="15" fill={c} />
      <rect x="16" y="16" width="16" height="16" rx="5.5" fill={m} />
    </>
  ),
  hexagon: (c, m) => (
    <>
      <polygon points={corners(6, 19, Math.PI / 6)} fill={c} stroke={c} strokeLinejoin="round" strokeWidth="7" />
      <circle cx="24" cy="24" r="8" fill="none" stroke={m} strokeWidth="4" />
    </>
  ),
  octagon: (c, m) => (
    <>
      <polygon points={corners(8, 20, Math.PI / 8)} fill={c} stroke={c} strokeLinejoin="round" strokeWidth="5" />
      <path d="M15 24h18" stroke={m} strokeWidth="5" strokeLinecap="round" />
    </>
  ),
  diamond: (c, m) => (
    <>
      <rect x="8" y="8" width="32" height="32" rx="9" fill={c} transform="rotate(45 24 24)" />
      <path d="M24 16v16M16 24h16" stroke={m} strokeWidth="4.5" strokeLinecap="round" />
    </>
  ),
  shield: (c, m) => (
    <>
      <path d="M24 4 41 10v13c0 10-7 17-17 21C14 40 7 33 7 23V10z" fill={c} stroke={c} strokeLinejoin="round" strokeWidth="3" />
      <path d="m16 23 6 6 10-11" fill="none" stroke={m} strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  pill: (c, m) => (
    <>
      <rect x="3" y="10" width="42" height="28" rx="14" fill={c} />
      <path d="M15 24h18" stroke={m} strokeWidth="5" strokeLinecap="round" />
    </>
  ),
  arch: (c, m) => (
    <>
      <path d="M6 43V22a18 18 0 0 1 36 0v21z" fill={c} stroke={c} strokeLinejoin="round" strokeWidth="3" />
      <path d="M17 43V31a7 7 0 0 1 14 0v12" fill={m} />
    </>
  ),
  drop: (c, m) => (
    <>
      <path d="M24 4c8 9 15 16 15 24a15 15 0 0 1-30 0C9 20 16 13 24 4z" fill={c} stroke={c} strokeLinejoin="round" strokeWidth="3" />
      <path d="M17 29a7 7 0 0 0 7 7" fill="none" stroke={m} strokeWidth="4" strokeLinecap="round" />
    </>
  ),
  ticket: (c, m) => (
    <>
      <path d="M5 9h38v10a5 5 0 0 0 0 10v10H5V29a5 5 0 0 0 0-10z" fill={c} stroke={c} strokeLinejoin="round" strokeWidth="3" />
      <path d="M24 14v4M24 22v4M24 30v4" stroke={m} strokeWidth="4" strokeLinecap="round" />
    </>
  ),
  pentagon: (c, m) => (
    <>
      <polygon points={corners(5, 19, -Math.PI / 2)} fill={c} stroke={c} strokeLinejoin="round" strokeWidth="7" />
      <path d="m16 27 8-9 8 9" fill="none" stroke={m} strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  gem: (c, m) => (
    <>
      <path d="M14 6h20l10 13-20 24L4 19z" fill={c} stroke={c} strokeLinejoin="round" strokeWidth="3" />
      <path d="M6 19h36M17 19l7 20 7-20" fill="none" stroke={m} strokeWidth="2.5" strokeLinejoin="round" opacity=".9" />
    </>
  ),
};

export function Avatar({ look, size = 36 }: { look: Look; size?: number }) {
  // Black is the page's ink, so it turns with the theme (bots.css).
  const black = look.color === 'black';
  return (
    <svg className="bot-avatar" width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
      {DRAW[look.shape](black ? 'var(--b-black)' : COLORS[look.color], black ? 'var(--b-black-mark)' : '#fff')}
    </svg>
  );
}

// The rail's icon for the page: two of the shapes side by side.
export function BotsIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="5.2" cy="6" r="3.2" />
      <rect x="8.3" y="7.3" width="5.7" height="5.7" rx="1.8" />
    </svg>
  );
}
