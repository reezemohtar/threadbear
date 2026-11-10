import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The website on made-up data, with no backend and no sign-in, for looking
// at a page while building it (docs/website.md, "Working on it"):
//
//     npx vite --config web/mock/vite.config.ts
//
// then http://localhost:5182/bots (add ?theme=dark or ?theme=light). It is
// the real site (web/src) with `convex/react` swapped for convex-react.tsx
// beside this, which answers from data.ts. Dev server only: there is no
// build of it.
export default defineConfig(({ command }) => {
  if (command === 'build') throw new Error('web/mock is for the dev server only');
  return {
    root: 'web',
    plugins: [react()],
    resolve: { alias: [{ find: /^convex\/react$/, replacement: path.resolve(import.meta.dirname, 'convex-react.tsx') }] },
    server: { port: 5182, strictPort: true },
  };
});
