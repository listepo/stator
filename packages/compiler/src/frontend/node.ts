/* The Node platform edge (plan.md §11c T11.5, docs/MODES.md §6): which specifiers name a Node
 * built-in, where `--node` resolves them, and what the frontend answers for the ones that cannot
 * compile yet.
 *
 * A built-in is `node:<id>` for any public id of the pinned Node's `builtinModules`, or the bare
 * `<id>` where Node accepts one (`path`, `fs/promises`; never `test` or `sqlite`, which Node
 * itself only resolves with the prefix). A bare built-in is never a package (docs/BUNDLER.md §1).
 * Under `--node` both spellings resolve to `packages/node/src/<id>.ts` through `paths` entries on
 * the program's own options, the same mechanism `std/` uses, so the checker, the gate and the
 * module graph agree on every edge. A landed file is ordinary strict TypeScript over `std`: below
 * this edge nothing knows it came from `node`.
 *
 * The flag is a platform, not a mode (§0.8): nothing below the frontend reads it. */

import { existsSync } from 'node:fs';
import { builtinModules } from 'node:module';
import { join } from 'node:path';
import { checkerDir, packageRoot } from '../support/package-root.ts';

type Mode = 'ts' | 'js';

/** The node package root: `STATOR_NODE_ROOT`, else the sibling workspace package, else a
 * published `node` beside `dist` (`support/package-root.ts`). */
const NODE_ROOT = packageRoot('STATOR_NODE_ROOT', 'node', 'src');

const NODE_SOURCE_DIR = checkerDir(join(NODE_ROOT, 'src'));

const PREFIX = 'node:';

/** The pinned Node's public built-in ids, without the prefix. `_`-prefixed ids (`_http_agent`)
 * are Node's own internals, the same exclusion `docs/NODE.md` makes. The list is read from the
 * Node running the compiler, which `pnpm run ci` pins to `.node-version`, so it is the same list
 * the coverage table counts. */
const BUILTIN_IDS: ReadonlySet<string> = new Set(
  builtinModules.map((m) => m.slice(m.startsWith(PREFIX) ? PREFIX.length : 0)).filter(isPublic),
);

/** The ids Node also resolves without the prefix. */
const BARE_IDS: ReadonlySet<string> = new Set(builtinModules.filter(isPublic));

function isPublic(id: string): boolean {
  return !id.startsWith('_') && !id.startsWith(PREFIX);
}

/** The built-in id a specifier names (`node:fs/promises` and `fs/promises` → `fs/promises`), or
 * `undefined` for anything else. */
export function nodeBuiltinId(specifier: string): string | undefined {
  if (specifier.startsWith(PREFIX)) {
    const id = specifier.slice(PREFIX.length);
    return BUILTIN_IDS.has(id) ? id : undefined;
  }
  return BARE_IDS.has(specifier) ? specifier : undefined;
}

/** The `paths` entries `--node` adds: `node:*` by wildcard, and each bare built-in by name, since a
 * bare wildcard would capture every package specifier. A built-in with no file finds nothing here,
 * and `classifyNodeSpecifier` is what refuses it. */
export function nodePathMapping(): Record<string, string[]> {
  const mapping: Record<string, string[]> = { [`${PREFIX}*`]: [`${NODE_SOURCE_DIR}/*.ts`] };
  for (const id of BARE_IDS) {
    mapping[id] = [`${NODE_SOURCE_DIR}/${id}.ts`];
  }
  return mapping;
}

/** Whether `packages/node` has landed the module for a built-in id. */
function landed(id: string): boolean {
  return existsSync(`${NODE_SOURCE_DIR}/${id}.ts`);
}

/** Whether a program source file is part of `packages/node`. */
export function isNodeSourceFile(fileName: string): boolean {
  return fileName.startsWith(`${NODE_SOURCE_DIR}/`);
}

export interface NodeNotYet {
  readonly kind: 'not-yet';
  readonly code: 'STA1214';
  readonly message: string;
  /** Absent when the answer is a flag to turn on rather than a phase to wait for
   * (`support/phases.ts`, the no-phase case). */
  readonly phase?: 11;
}

const T11_6 = 'planned for Phase 11 (T11.6: packages/node)';

/** What a built-in specifier means for this build, or `undefined` when it is not a built-in (or
 * is one `--node` resolves to a landed module, which compiles like any other edge). */
export function classifyNodeSpecifier(specifier: string, node: boolean): NodeNotYet | undefined {
  const id = nodeBuiltinId(specifier);
  if (id === undefined) {
    return undefined;
  }
  if (!node) {
    return {
      kind: 'not-yet',
      code: 'STA1214',
      message: `'${specifier}' is a Node built-in; it is available with --node (docs/MODES.md §6)`,
    };
  }
  if (landed(id)) {
    return undefined;
  }
  return {
    kind: 'not-yet',
    code: 'STA1214',
    message: `'${specifier}' is not yet supported; ${T11_6}`,
    phase: 11,
  };
}

/** A named import the landed module does not export yet but the pinned Node's module does, or
 * `undefined` for any other name (which the checker answers as before: a member Node does not
 * have is a plain error). */
export function classifyNodeMember(
  specifier: string,
  member: string,
  node: boolean,
): NodeNotYet | undefined {
  const id = nodeBuiltinId(specifier);
  if (!node || id === undefined || !landed(id)) {
    return undefined;
  }
  const exports: unknown = process.getBuiltinModule(`${PREFIX}${id}`);
  if (typeof exports !== 'object' || exports === null || !(member in exports)) {
    return undefined;
  }
  return {
    kind: 'not-yet',
    code: 'STA1214',
    message: `'${member}' from '${specifier}' is not yet supported; ${T11_6}`,
    phase: 11,
  };
}

/** The verdict on a free `require` (plan.md §11c T11.5, docs/BUNDLER.md §4). ESM is the module
 * system in `ts` mode, and without `--node`, so `require` is refused by design (`STA1110`). With
 * `--node` in `js` mode a CommonJS project file goes to the bundler whole (T12.1) and never reaches
 * the gate; a `require` that does — the bundle's own call on a built-in, or one beside ES-module
 * syntax — is T11.5's open `createRequire` step, so it is not-yet naming Phase 11. */
export function requireVerdict(
  mode: Mode,
  node: boolean,
):
  | { kind: 'never'; code: 'STA1110'; message: string }
  | { kind: 'not-yet'; code: 'STA1214'; message: string; phase: 11 } {
  if (mode === 'js' && node) {
    return {
      kind: 'not-yet',
      code: 'STA1214',
      message:
        'CommonJS require() under --node is not yet supported; planned for Phase 11 ' +
        '(T11.5: require over built-ins through createRequire)',
      phase: 11,
    };
  }
  return {
    kind: 'never',
    code: 'STA1110',
    message:
      mode === 'ts'
        ? 'CommonJS require() is not supported — ts mode uses ES modules only'
        : 'CommonJS require() is not supported — without --node, Stator uses ES modules only',
  };
}
