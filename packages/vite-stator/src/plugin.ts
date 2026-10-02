/* The `stator()` Vite plugin (plan.md §11d T12.2): `vite build` ends in a native binary. Vite's
 * own build of the entry only gives the run an input and writes nothing; once it closes, the
 * compiler builds the program, and in `js` mode its packages go through this package's adapter. */

import { mkdirSync } from 'node:fs';
import { basename, dirname, extname, resolve } from 'node:path';
import { compile } from 'statorc/api';
import type { Plugin, ResolvedConfig } from 'vite';
import { adapter } from './adapter.ts';

export interface StatorPluginOptions {
  /** The program's entry file, relative to Vite's `root`. */
  readonly entry: string;
  /** The binary, relative to `root`. Default: the entry's name without its extension, in
   * `build.outDir`. */
  readonly out?: string;
  /** Stator's mode (docs/MODES.md). Default `js`, the mode that bundles packages. */
  readonly mode?: 'ts' | 'js';
}

/** Platform code Vite must not try to resolve: Stator links it, the bundler never sees it. */
const PLATFORM: readonly RegExp[] = [/^node:/, /^std\//];

export function stator(options: StatorPluginOptions): Plugin {
  const mode = options.mode ?? 'js';
  let config: ResolvedConfig | undefined;
  return {
    name: 'stator',
    apply: 'build',
    config: () => ({
      build: {
        ssr: options.entry,
        write: false,
        copyPublicDir: false,
        rolldownOptions: { external: [...PLATFORM] },
      },
    }),
    configResolved: (resolved) => {
      config = resolved;
    },
    async closeBundle() {
      if (config === undefined)
        throw new Error('stator(): Vite closed a build it never configured');
      const entry = resolve(config.root, options.entry);
      const out =
        options.out === undefined
          ? resolve(config.root, config.build.outDir, basename(entry, extname(entry)))
          : resolve(config.root, options.out);
      mkdirSync(dirname(out), { recursive: true });
      const result = await compile({
        entry,
        mode,
        out,
        ...(mode === 'js' ? { bundler: adapter } : {}),
      });
      if (!result.ok) {
        const reason =
          result.error === undefined
            ? result.stderr
            : `stator: ${result.error.code} ${result.error.message}`;
        throw new Error(`stator build failed for ${options.entry}\n${reason}`);
      }
      config.logger.info(`stator: built ${out}`);
    },
  };
}
