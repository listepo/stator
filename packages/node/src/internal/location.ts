// Where a module is at run time (docs/MODES.md §6, plan-notes 312): relative to the executable,
// resolved when the program asks. The compiler rewrites every `import.meta.url`,
// `import.meta.filename` and `import.meta.dirname`, and every free `__filename` and `__dirname` in
// the vendor module, into a call here with the file's path relative to the entry's directory
// (`frontend/location.ts`). No build-machine path reaches the binary.

import { execPath } from 'std/process';
import { dirname, join } from '../path.ts';
import { pathToFileHref } from './url.ts';

/** `__filename` / `import.meta.filename`: the binary's directory joined with `relative`. */
export function __statorFilename(relative: string): string {
  return join(dirname(execPath()), relative);
}

/** `__dirname` / `import.meta.dirname`: the directory of `__statorFilename(relative)`. */
export function __statorDirname(relative: string): string {
  return dirname(__statorFilename(relative));
}

/** `import.meta.url`: the `file:` URL of `__statorFilename(relative)`. */
export function __statorModuleUrl(relative: string): string {
  return pathToFileHref(__statorFilename(relative));
}
