/* Shared fixture-build primitives for the runners that compile programs (golden, ffi).
 *
 * `buildInProcess` + `compileFixtureC` grew independently in both runners into the same
 * code (the in-process `build()` call, the per-fixture `.c` compile, the shim-aware Node
 * oracle) — extraction rather than a third copy, the same reason `support/parallel.ts`
 * exists. Callers keep their own scratch-dir names, failure strings, and reports; only
 * the mechanics are shared, so a behavior change here is visible in every suite at once.
 */

import { existsSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { BuildError, build, withDiagnosticCapture } from '../../compiler/src/cli/build.ts';
import { nodePath } from './node-path.ts';
import { runProcess } from './parallel.ts';

/** Both streams: console.error/warn write to STDERR in Node and the runtime mirrors that —
 * comparing stdout alone would let a wrong-stream bug pass. */
export interface FixtureStreams {
  readonly stdout: string;
  readonly stderr: string;
}

export interface BuildFixtureArgs {
  readonly entry: string;
  readonly out: string;
  readonly mode: 'ts' | 'js';
  readonly linkFlags?: readonly string[];
  readonly emitHeader?: string;
  readonly unitName?: string;
}

/* In-process compile (plan.md §9 Task 6.6): `build()` under `withDiagnosticCapture` — the
 * test262 runner's pattern. The clang link still happens, inside `build()` itself (which
 * spawns clang); only the TypeScript-host hop goes away. Throws with the same
 * `stator build failed: ...` message the old spawn produced. */
export async function buildFixture(args: BuildFixtureArgs): Promise<void> {
  let status = 0;
  let stderr = '';
  try {
    ({ result: status, stderr } = await withDiagnosticCapture(() =>
      build({
        entry: args.entry,
        out: args.out,
        mode: args.mode,
        emitCOnly: false,
        keepC: false,
        linkFlags: args.linkFlags ?? [],
        ...(args.emitHeader !== undefined ? { emitHeader: args.emitHeader } : {}),
        ...(args.unitName !== undefined ? { unitName: args.unitName } : {}),
      }),
    ));
  } catch (error) {
    // The CLI renders a BuildError as exit 1 with `stator: CODE message` on stderr.
    if (!(error instanceof BuildError)) throw error;
    status = 1;
    stderr = `stator: ${error.code} ${error.message}\n`;
  }
  if (status !== 0) {
    throw new Error(`stator build failed: ${stderr.trim()}`);
  }
}

/* A fixture directory may carry its own C sources next to the entry (plan.md §10 Task 7.1
 * step 10): the two-function `.c` an extern golden proves the boundary against. Each one is
 * compiled here — same C11 `-Wall -Wextra -Werror` discipline as the runtime, so a warning
 * in fixture C fails the fixture rather than the link — and the objects ride `build()`'s
 * `--link=` channel, which is exactly the `extraLinkFlags` consumer path step 7 exists to
 * prove. `work` is the caller's pool-unique scratch directory, so the objects beside it
 * can never collide between workers. A fixture without C sources links exactly as before. */
export async function compileFixtureC(entry: string, work: string): Promise<string[]> {
  const dir = dirname(entry);
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch {
    return [];
  }
  const sources = names.filter((name) => name.endsWith('.c')).sort();
  const objects: string[] = [];
  for (const source of sources) {
    const object = join(work, `${source}.o`);
    const cc = process.env['CC'] ?? 'clang';
    const compiled = await runProcess(cc, [
      '-std=c11',
      '-O2',
      '-Wall',
      '-Wextra',
      '-Werror',
      '-c',
      join(dir, source),
      '-o',
      object,
    ]);
    if (compiled.status !== 0) {
      throw new Error(`fixture C ${source} failed to compile: ${compiled.stderr.trim()}`);
    }
    objects.push(object);
  }
  return objects;
}

/* The oracle, never the host: the compiler runs in-process on this host while ground truth
 * comes from the pinned Node (or `STATOR_NODE`). A fixture directory may carry a
 * `node_shim.mjs` preloading native bindings Node-side (FFI fixtures cannot run under Node
 * as written — an ambient `declare function` erases to nothing), loaded via `--import`
 * before the entry and invisible to Stator, which never imports it. `env` is the caller's
 * pinned environment (TZ=UTC on both sides), kept per-caller so this helper owns no clock. */
export async function runNodeOracle(path: string, env: NodeJS.ProcessEnv): Promise<FixtureStreams> {
  const shim = join(dirname(path), 'node_shim.mjs');
  const args = existsSync(shim) ? ['--import', shim, path] : [path];
  const result = await runProcess(nodePath(), args, { env });
  if (result.status !== 0) {
    throw new Error(`node exited ${String(result.status)}: ${result.stderr.trim()}`);
  }
  return { stdout: result.stdout, stderr: result.stderr };
}
