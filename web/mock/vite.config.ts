import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The website on made-up data, with no backend and no sign-in, for looking
// at a page while building it (docs/website.md, "Working on it"):
//
//     npx vite --config web/mock/vite.config.ts
//
// then http://localhost:5182/bots (add ?theme=dark or ?theme=light; for a
// stress run ?stress=200 adds that many bots, ?slow=150 makes each one-off
// read take that long, ?fail=30 fails that share of them once). To look at
// the failure states: ?fail=50 for the Try again line, ?failwatch=1 on a bot
// with no chat (/bots/odo-0005) for its folder check failing, and
// ?failpage=1 for the page's own code not arriving. It is
// the real site (web/src) with `convex/react` swapped for convex-react.tsx
// beside this, which answers from data.ts. Dev server only: there is no
// build of it.
export default defineConfig(({ command }) => {
  if (command === 'build') throw new Error('web/mock is for the dev server only');
  return {
    root: 'web',
    plugins: [
      react(),
      {
        // ?failpage=1: the Bots page's code answers 500, as a dropped
        // connection or a replaced build would. The flag reaches here as a
        // cookie convex-react.tsx sets, since a module's request doesn't
        // carry the page's address.
        name: 'mock-fail-page',
        configureServer(server) {
          server.middlewares.use((req, res, next) => {
            if (req.url?.includes('/src/bots-page.tsx') && req.headers.cookie?.includes('mockfailpage=1')) {
              res.statusCode = 500;
              res.end('mock: the page did not load');
              return;
            }
            next();
          });
        },
      },
    ],
    resolve: { alias: [{ find: /^convex\/react$/, replacement: path.resolve(import.meta.dirname, 'convex-react.tsx') }] },
    server: { port: 5182, strictPort: true },
  };
});
