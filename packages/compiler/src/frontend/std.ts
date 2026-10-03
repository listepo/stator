/* The `std/` import edge (plan.md §11c T11.2, docs/STD.md §1): the one place that knows which
 * specifiers name Stator's first-party standard library and where its sources live.
 *
 * `std/<name>` is a RESERVED prefix, not a package: a known name resolves to
 * `packages/std/src/<name>.ts` through a `paths` entry on the program's own options (so the
 * checker, the gate and the module graph all resolve it identically), `std/sync` and
 * `std/thread` are not-yet until T10.2's threads exist, and every other `std/…` is a hard error
 * (STA3002) — never a silent fall-through to a package lookup. A std file is ordinary strict
 * TypeScript once resolved: below this edge nothing knows it came from `std`, except the link,
 * which adds `libjsrt_std.a` when the module graph holds one (cli/build.ts).
 *
 * Nothing here depends on the mode: `std` is the same library under `ts` and `js` (§0.8). */

import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { checkerDir, packageRoot } from '../support/package-root.ts';

const PREFIX = 'std/';

/** The std package root: `STATOR_STD_ROOT`, else the sibling workspace package, else a published
 * `std` beside `dist` (`support/package-root.ts`). A wrong guess leaves the module list empty, and
 * every `std/` import is STA3002 naming no modules. */
export const STD_ROOT = packageRoot('STATOR_STD_ROOT', 'std', 'src');

const STD_SOURCE_DIR = checkerDir(join(STD_ROOT, 'src'));

/** Modules whose surface needs T10.2's OS threads (docs/STD.md §5). */
const THREAD_MODULES: ReadonlySet<string> = new Set(['sync', 'thread']);

/** Members a std module will export once T10.2's thread pool exists: the Promise twins of the
 * sync `std/fs` calls (docs/STD.md §2, T10.1 step 5). They are refused as not-yet rather than
 * shipped as sync calls under `async`, which would block main inside an async program. */
const THREAD_POOL_MEMBERS: ReadonlyMap<string, ReadonlySet<string>> = new Map([
  [
    'fs',
    new Set([
      'readTextAsync',
      'writeTextAsync',
      'statAsync',
      'mkdirAsync',
      'unlinkAsync',
      'rmdirAsync',
    ]),
  ],
]);

let moduleNames: readonly string[] | undefined;

/** The std modules: one per lower-case top-level `src/<name>.ts`. Subdirectories (`native/`,
 * `internal/`) are the library's own plumbing and never importable. */
export function stdModuleNames(): readonly string[] {
  if (moduleNames === undefined) {
    let names: string[];
    try {
      names = readdirSync(STD_SOURCE_DIR);
    } catch {
      names = [];
    }
    moduleNames = names
      .filter((name) => /^[a-z]+\.ts$/.test(name))
      .map((name) => name.slice(0, -'.ts'.length))
      .sort();
  }
  return moduleNames;
}

/** The `paths` entry that resolves `std/<name>` for the checker and the module graph. An unknown
 * name finds no file here; `classifyStdSpecifier` is what refuses it. */
export function stdPathMapping(): Record<string, string[]> {
  return { [`${PREFIX}*`]: [`${STD_SOURCE_DIR}/*.ts`] };
}

/** What an import specifier means at the std edge, or `undefined` when it does not start with
 * `std/` (an ordinary relative import or a package, which the gate rules on as before). */
export interface StdNotYet {
  readonly kind: 'not-yet';
  readonly code: 'STA1214';
  readonly message: string;
  readonly phase: 10;
}

export type StdSpecifier =
  | { readonly kind: 'module'; readonly name: string }
  | StdNotYet
  | { readonly kind: 'unknown'; readonly code: 'STA3002'; readonly message: string };

export function classifyStdSpecifier(specifier: string): StdSpecifier | undefined {
  if (!specifier.startsWith(PREFIX)) {
    return undefined;
  }
  const name = specifier.slice(PREFIX.length);
  if (stdModuleNames().includes(name)) {
    return { kind: 'module', name };
  }
  if (THREAD_MODULES.has(name)) {
    return {
      kind: 'not-yet',
      code: 'STA1214',
      message: `'${specifier}' is not yet supported; planned for Phase 10 (T10.2: OS threads)`,
      phase: 10,
    };
  }
  const known = stdModuleNames()
    .map((m) => PREFIX + m)
    .join(', ');
  return {
    kind: 'unknown',
    code: 'STA3002',
    message: `unknown std module '${specifier}' — the std modules are ${known === '' ? '(none found)' : known}`,
  };
}

/** A named import of a std member that waits for T10.2, or `undefined` for any other name (which
 * the checker answers as before: a member no module exports is a plain error). */
export function classifyStdMember(specifier: string, member: string): StdNotYet | undefined {
  if (!specifier.startsWith(PREFIX)) {
    return undefined;
  }
  if (THREAD_POOL_MEMBERS.get(specifier.slice(PREFIX.length))?.has(member) !== true) {
    return undefined;
  }
  return {
    kind: 'not-yet',
    code: 'STA1214',
    message:
      `'${member}' from '${specifier}' is not yet supported; planned for Phase 10 ` +
      '(T10.2: Promise-flavored std/fs runs on the thread pool)',
    phase: 10,
  };
}

/** Whether a program source file is part of the std library — what decides the archive link. */
export function isStdSourceFile(fileName: string): boolean {
  return fileName.startsWith(`${STD_SOURCE_DIR}/`);
}
