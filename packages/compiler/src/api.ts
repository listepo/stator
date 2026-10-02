/* `statorc/api` (plan.md §11d T12.1 step 1, docs/BUNDLER.md §5): the compiler as a library, for a
 * bundler integration (`vite-stator`, T12.2) and for tests. The same driver as the CLI, so a
 * program compiles the same way whichever door it came in by.
 *
 * Everything an adapter or a caller hands in is `unknown` until `src/cli/bundler.ts` checks it
 * (golden rule 4): the types below are the contract, not a promise the compiler relies on. */

import { resolve } from 'node:path';
import { build, BuildError, compileToC, withDiagnosticCapture } from './cli/build.ts';
import {
  type BundlerAdapter,
  type BundlerChoice,
  type BundleResult,
  bundlerChoice,
  DEFAULT_BUNDLER,
} from './cli/bundler.ts';
import { createProgram } from './frontend/program.ts';
import { planVendor, type VendorEntry } from './frontend/vendor.ts';
import type { Diagnostic } from './support/diagnostics.ts';

export type { BundleOptions, BundleResult, BundlerAdapter } from './cli/bundler.ts';
export type { VendorEntry } from './frontend/vendor.ts';
export type { Diagnostic } from './support/diagnostics.ts';
export type { SourceMapV3 } from './support/sourcemap.ts';

export interface CompileRequest {
  /** The entry file; relative paths resolve against the current directory. */
  readonly entry: string;
  readonly mode: 'ts' | 'js';
  /** A vendor bundle the caller already built from `vendorEntry`'s answer. */
  readonly bundle?: BundleResult;
  /** Otherwise the adapter that builds it: an adapter object, a module to load by name or path,
   * or `'none'`. Default `'vite'` (`vite-stator`), loaded only when the graph needs it. */
  readonly bundler?: BundlerAdapter | string;
  /** Link an executable here. Without it, `compile` stops at C and answers the text. */
  readonly out?: string;
  /** `--node`, the Node platform (docs/MODES.md §6). It also gates CommonJS project files: only
   * under it do they go to the bundler (plan-notes 315). */
  readonly node?: boolean;
}

export interface CompileResult {
  /** The program compiled, and linked when `out` was given. */
  readonly ok: boolean;
  /** Every diagnostic that decided a rejection, vendor ones mapped to the original files. */
  readonly diagnostics: readonly Diagnostic[];
  /** What the CLI would have printed to stderr. */
  readonly stderr: string;
  /** A build that failed before any source position: STA0004, STA0014, STA0015, a missing entry. */
  readonly error?: { readonly code: string; readonly message: string };
  /** The translation unit, when `out` was not given and the program compiled. */
  readonly c?: string;
}

function choice(request: CompileRequest): BundlerChoice | undefined {
  if (request.bundle !== undefined) return { kind: 'bundle', bundle: request.bundle };
  const bundler = request.bundler;
  if (bundler === undefined) return undefined;
  return typeof bundler === 'string'
    ? bundlerChoice(bundler)
    : { kind: 'adapter', adapter: bundler };
}

/** Compile one program. Never throws for anything the user can act on: a refusal is a result. */
export async function compile(request: CompileRequest): Promise<CompileResult> {
  const bundler = choice(request);
  if (request.mode === 'ts' && bundler !== undefined) {
    const message = 'a bundle or a bundler requires mode js';
    return { ok: false, diagnostics: [], stderr: '', error: { code: 'STA0004', message } };
  }
  const out = request.out;
  try {
    if (out === undefined) {
      const { result, stderr, diagnostics } = await withDiagnosticCapture(() =>
        compileToC(
          request.entry,
          request.mode,
          undefined,
          bundler ?? DEFAULT_BUNDLER,
          request.node ?? false,
        ),
      );
      return result === null
        ? { ok: false, diagnostics, stderr }
        : { ok: true, diagnostics, stderr, c: result.c };
    }
    const { result, stderr, diagnostics } = await withDiagnosticCapture(() =>
      build({
        entry: request.entry,
        out,
        mode: request.mode,
        emitCOnly: false,
        keepC: false,
        bundler: bundler ?? DEFAULT_BUNDLER,
        node: request.node ?? false,
      }),
    );
    return { ok: result === 0, diagnostics, stderr };
  } catch (error) {
    if (!(error instanceof BuildError)) throw error;
    return {
      ok: false,
      diagnostics: [],
      stderr: '',
      error: { code: error.code, message: error.message },
    };
  }
}

/** What the bundler would be asked to bundle for this program, or `undefined` when the graph
 * imports no package and holds no CommonJS file it may route (`node`, as in `CompileRequest`).
 * `ts` mode never bundles. */
export function vendorEntry(
  entry: string,
  mode: 'ts' | 'js',
  node = false,
): VendorEntry | undefined {
  if (mode === 'ts') return undefined;
  const { program } = createProgram(entry, mode, undefined, undefined, node);
  const entryFile = program.getSourceFile(resolve(entry).replace(/\\/g, '/'));
  return entryFile === undefined ? undefined : planVendor(program, entryFile, node)?.entry;
}
