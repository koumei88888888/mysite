import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import { readFileSync } from 'node:fs';
import { resolve, join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(fileURLToPath(new URL('.', import.meta.url)), '../..');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css':  'text/css',
  '.js':   'text/javascript',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon',
};

/** Dev only: リポジトリルートのファイルを /mysite/ 以下で配信する */
function devPortal() {
  return {
    name: 'dev-portal',
    hooks: {
      'astro:server:setup'({ server }) {
        const handle = (req, res, next) => {
          const url = req.url ?? '';
          if (!url.startsWith('/mysite')) { next(); return; }

          const sub = url.slice('/mysite'.length) || '/';
          if (sub.startsWith('/apps/review')) { next(); return; }

          const rel = sub === '/' ? 'index.html' : sub.slice(1).split('?')[0];
          const filePath = join(repoRoot, rel);

          try {
            const content = readFileSync(filePath);
            res.setHeader('Content-Type', MIME[extname(filePath)] ?? 'text/plain');
            res.end(content);
          } catch {
            next();
          }
        };

        // ミドルウェアスタックの先頭に挿入して確実に最初に実行する
        if (Array.isArray(server.middlewares.stack)) {
          server.middlewares.stack.unshift({ route: '', handle });
        } else {
          server.middlewares.use(handle);
        }
      },
    },
  };
}

export default defineConfig({
  site: 'https://koumei88888888.github.io',
  base: '/mysite/apps/review',
  integrations: [mdx(), devPortal()],
  output: 'static',
});
