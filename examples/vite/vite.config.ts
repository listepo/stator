import { defineConfig } from 'vite';
import { stator } from 'vite-stator';

// `vite build` writes the native binary to dist/hello (plan.md §11d T12.2).
export default defineConfig({
  plugins: [stator({ entry: 'src/main.js', out: 'dist/hello' })],
});
