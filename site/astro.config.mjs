// @ts-check
import { defineConfig } from 'astro/config';

// GitHub project Pages: https://listepo.github.io/stator/
// Local root preview: ASTRO_BASE=/ pnpm build && ASTRO_BASE=/ pnpm preview
const base = process.env.ASTRO_BASE ?? '/stator/';

// https://astro.build/config
export default defineConfig({
  output: 'static',
  base,
  site: 'https://listepo.github.io',
});
