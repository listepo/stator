/* Where a first-party sibling package lives: the C runtime, `std` and `node`. One rule for all
 * three, so they cannot disagree about a layout.
 *
 * In the source tree the package is `<workspace>/packages/<name>`, reached identically from
 * `src/support` and the compiled `dist/support` because `dist` mirrors `src`'s depth; a published
 * `statorc` bundles it beside `dist`. An environment variable overrides both. A wrong guess fails
 * where the package is first used (a missing archive at link time, an empty module list), never
 * here. */

import { existsSync, realpathSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** The package root: `env` when set, else the workspace sibling when it has `marker`, else the
 * published copy beside `dist`. */
export function packageRoot(env: string, name: string, marker: string): string {
  const override = process.env[env];
  if (override !== undefined && override !== '') {
    return override;
  }
  const here = dirname(fileURLToPath(import.meta.url));
  const sibling = join(here, '..', '..', '..', name);
  const bundled = join(here, '..', '..', name);
  return existsSync(join(sibling, marker)) ? sibling : bundled;
}

/** A source directory as the checker spells file names: real path, forward slashes. The checker
 * resolves modules to real paths and normalizes every `fileName` to `/`, so a prefix test must
 * compare like with like — a root reached through a symlink (macOS `/tmp`) would otherwise never
 * match. */
export function checkerDir(dir: string): string {
  return (existsSync(dir) ? realpathSync(dir) : dir).replace(/\\/g, '/');
}
