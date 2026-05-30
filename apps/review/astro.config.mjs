import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';

export default defineConfig({
  site: 'https://koumei88888888.github.io',
  base: '/mysite/apps/review',
  integrations: [mdx()],
  output: 'static',
});
