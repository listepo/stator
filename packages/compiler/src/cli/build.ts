/** The build driver: source -> program -> gate -> HIR -> C -> clang -> executable (plan.md §5
 * Task 2.4).
 *
 * Everything policy-shaped lives above this file. The driver's own job is only sequencing and
 * process control, and it stops at the FIRST stage that produced diagnostics: continuing past a
 * rejected gate would hand the lowering source it already refused, and every diagnostic after that
 * would be a consequence of the first one rather than a fact about the program.
 */

import { AsyncLocalStorage } from 'node:async_hooks';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { emitC, type LibraryEmit } from '../codegen/index.ts';
import { collectLinkFlags } from '../frontend/extern.ts';
import {
  collectUnitExports,
  defaultUnitName,
  exportVersionDefinition,
  renderHeader,
  sanitizeUnitName,
} from '../frontend/export.ts';
import { gateProgram } from '../frontend/gate.ts';
import { moduleOrder } from '../frontend/graph.ts';
import { createProgram } from '../frontend/program.ts';
import { verifyHir } from '../hir/verify.ts';
import { lowerProgram } from '../lower/index.ts';
import { optimize } from '../passes/index.ts';
import type { Diagnostic } from '../support/diagnostics.ts';
import { runtimeFlavor } from '../support/features.ts';
import { withSpan } from '../support/telemetry.ts';
import { diagnosticLines, INK_COLORS, print, type Line } from './render.ts';

type Mode = 'ts' | 'js';

export type OptLevel = 0 | 1 | 2 | 3;

export interface BuildOptions {
  readonly entry: string;
  readonly out: string;
  readonly mode: Mode;
  /** Stop after writing C to `out` instead of invoking the C compiler. */
  readonly emitCOnly: boolean;
  /** Keep the intermediate .c next to the executable instead of deleting it. */
  readonly keepC: boolean;
  /** clang `-O` for the final link when not under ASan. Default 2; CLI `--opt` / `STATOR_OPT`
   * override. `0` trades runtime speed for faster iterate compiles. Full per-module `.o` cache and
   * parallel clang are a separate follow-up — not this knob. */
  readonly opt?: OptLevel;
  /** Extra clang link flags from the CLI `--link=` escape hatch (docs/FFI.md §9), in
   * command-line order. The `.d.ts` `@statorLink` pragma flags travel inside the compiled
   * result instead — see `compileToC` — and the link deduplicates libraries across all three
   * sources while preserving order. Accepted but inert with `--emit-header`: nothing links,
   * so there is no line to join (docs/FFI.md §8). */
  readonly linkFlags?: readonly string[];
  /** Write a C header for the unit's exports to this path (docs/FFI.md §8, plan §10 Task 7.2
   * steps 1–2) and compile a relocatable object instead of linking an executable: a unit
   * exposed to C usually has no `main`, and linking is the consumer's job. Export refusals
   * (STA1122–STA1124) stop the build before anything is written. */
  readonly emitHeader?: string;
  /** `--unit-name` override for the `stator_<unit>_<name>` mangling; defaults to the entry's
   * file basename. Sanitized to a C identifier wherever it came from. */
  readonly unitName?: string;
}

/** Raised for conditions the USER can act on: a missing file, a missing toolchain. Anything the
 * user cannot act on is a Diagnostic with an STA4xxx code, not an exception. */
export class BuildError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = 'BuildError';
  }
}

/** Per-async-context sink for diagnostics when several builds share one process.
 *
 * test262 used to spawn a fresh `node …/cli/main.ts build` per test (~0.4–1.2s) just to keep
 * stderr isolated. In-process `build()` is ~100–160ms, but concurrent builds must not interleave
 * ink frames on the shared stderr — and must not pay ink's ~1.6s first-import cost on every
 * diagnostic either. When a capture store is set, emitters append plain `diagnosticLines` text;
 * otherwise the CLI keeps printing through ink to stderr.
 */
interface DiagnosticCapture {
  readonly lines: string[];
}

const diagnosticCapture = new AsyncLocalStorage<DiagnosticCapture>();

/** Run `fn` with diagnostics captured as plain text (no ink). */
export async function withDiagnosticCapture<T>(
  fn: () => Promise<T>,
): Promise<{ result: T; stderr: string }> {
  const store: DiagnosticCapture = { lines: [] };
  const result = await diagnosticCapture.run(store, fn);
  return { result, stderr: store.lines.join('') };
}

/** Route diagnostic lines to the capture store when set, else ink → stderr. */
async function emitDiagnosticLines(lines: readonly Line[]): Promise<void> {
  const store = diagnosticCapture.getStore();
  if (store !== undefined) {
    // Empty is a no-op, matching `print`: capturing nothing must cost nothing.
    if (lines.length === 0) {
      return;
    }
    store.lines.push(`${lines.map((line) => line.text).join('\n')}\n`);
    return;
  }
  await print(lines, process.stderr);
}

/** The C runtime (headers + built archive) is a sibling package. In the source tree it is
 * `<workspace>/packages/runtime`, reached identically from `src/cli` and the compiled `dist/cli`
 * because `dist` mirrors `src`'s depth; a published `statorc` bundles it beside `dist`.
 * `STATOR_RUNTIME_ROOT` overrides both. A wrong guess is caught at link time (missing archive),
 * exactly as before. */
function resolveRuntimeRoot(): string {
  const override = process.env['STATOR_RUNTIME_ROOT'];
  if (override !== undefined && override !== '') {
    return override;
  }
  const here = dirname(fileURLToPath(import.meta.url));
  const sibling = join(here, '..', '..', '..', 'runtime'); // packages/compiler/<src|dist>/cli → packages/runtime
  const bundled = join(here, '..', '..', 'runtime'); // published: runtime beside dist/
  return existsSync(join(sibling, 'include')) ? sibling : bundled;
}

const RUNTIME_ROOT = resolveRuntimeRoot();
const RUNTIME_INCLUDE = join(RUNTIME_ROOT, 'include');

/** `STATOR_RUNTIME=asan` links the sanitized archive and passes the matching flags, so CI can run
 * the SAME golden fixtures under ASan/UBSan (plan.md §5 Task 2.7). The sanitizer has to be on both
 * the archive and the final link or the instrumentation is only half applied, which is why one
 * variable controls both rather than exposing a flags knob. */
const FLAVOR = runtimeFlavor();
const SANITIZED = FLAVOR === 'asan';
const RUNTIME_DIR_OF = { default: 'build', asan: 'build-asan', intl: 'build-intl' } as const;
const RUNTIME_JUST_RECIPE = {
  default: 'runtime',
  asan: 'runtime-asan',
  intl: 'runtime-intl',
} as const;
const RUNTIME_LIB_DIR = join(RUNTIME_ROOT, RUNTIME_DIR_OF[FLAVOR]);
const RUNTIME_ARCHIVE = join(RUNTIME_LIB_DIR, 'libjsrt.a');
const SANITIZER_FLAGS = ['-O1', '-g', '-fsanitize=address,undefined'];

/** What a program linking this archive must pass — Boehm's `-lgc` when the runtime was built
 * against it, ICU's when the archive is the feature build, `-flto=thin` when its objects are
 * bitcode (plan-notes 162) — written next to the archive by the just recipe that produced it.
 * Reading them back is the only way this link cannot disagree with the objects it links:
 * rediscovering them here would ask `pkg-config` a second time, in a different environment, and
 * an archive compiled WITH Boehm linked WITHOUT `-lgc` is an undefined-symbol error at the end of
 * every compile (plan-notes 106). The flags go on the one clang call below, so `-flto` also turns
 * the generated C into bitcode and the runtime inlines into it. Absent means an archive built
 * before the recipe wrote one; the link then fails the way it always did, which is the honest
 * outcome. */
function extraLinkFlags(): string[] {
  const recorded = join(RUNTIME_LIB_DIR, 'link-flags.txt');
  if (!existsSync(recorded)) {
    return [];
  }
  const flags = readFileSync(recorded, 'utf8').trim();
  return flags === '' ? [] : flags.split(/\s+/);
}

/** Returns the process exit code: 0 on success, 1 if the program was rejected. */
export async function build(options: BuildOptions): Promise<number> {
  // Sanitized once here — including an explicit `--unit-name`, which the shell will carry
  // verbatim — so the header and every mangled symbol are valid C whatever was spelled.
  const unit =
    options.emitHeader === undefined
      ? undefined
      : sanitizeUnitName(options.unitName ?? defaultUnitName(options.entry));
  const compiled = await compileToC(options.entry, options.mode, unit);
  if (compiled === null) {
    return 1;
  }

  if (options.emitCOnly) {
    writeFileSync(options.out, compiled.c, 'utf8');
    if (options.emitHeader !== undefined) {
      writeFileSync(options.emitHeader, compiled.header ?? '', 'utf8');
    }
    return 0;
  }

  if (options.emitHeader !== undefined) {
    writeFileSync(options.emitHeader, compiled.header ?? '', 'utf8');
    // A unit exposed to C links at the consumer, not here: `clang -c`, no `-ljsrt`, no
    // extern link flags. The init, stubs, and error cell (Task 7.2 steps 3–5) are already in
    // the C; only `main` is absent, which is what makes this an object and not a program.
    const scratch = options.keepC ? null : mkdtempSync(join(tmpdir(), 'stator-'));
    const cPath = options.keepC ? `${options.out}.c` : join(scratch ?? '', 'module.c');
    try {
      writeFileSync(cPath, compiled.c, 'utf8');
      compileObject(cPath, options.out, options.opt ?? 2);
      return 0;
    } finally {
      if (scratch !== null) {
        rmSync(scratch, { recursive: true, force: true });
      }
    }
  }

  // The .c goes beside the executable when it is being kept, so `--keep-c` produces a file the
  // user can actually find; otherwise it lives in a temp dir that is removed on every exit path.
  const scratch = options.keepC ? null : mkdtempSync(join(tmpdir(), 'stator-'));
  const cPath = options.keepC ? `${options.out}.c` : join(scratch ?? '', 'module.c');

  try {
    writeFileSync(cPath, compiled.c, 'utf8');
    // Default -O2; STATOR_OPT=0 / --opt=0 skips most clang opts for faster iterate compiles.
    // Per-module parallel .o cache stays a follow-up (plan.md §12).
    linkExecutable(cPath, options.out, options.opt ?? 2, [
      ...compiled.linkFlags,
      ...(options.linkFlags ?? []),
    ]);
    return 0;
  } finally {
    if (scratch !== null) {
      rmSync(scratch, { recursive: true, force: true });
    }
  }
}

/** Source text compiled to C, plus what the link owes the extern surface: the `@statorLink`
 * flags every extern-bearing `.d.ts` contributed (docs/FFI.md §9), in program order. The CLI
 * `--link=` flags join them at the link, never here — one source per carrier. `header` is the
 * `--emit-header` text, present only when a unit name was given (Task 7.2 steps 1–2). */
export interface CompiledC {
  readonly c: string;
  readonly linkFlags: readonly string[];
  readonly header?: string;
}

/** The pure half: source text in, C text out, diagnostics to stderr. Shared with `explain`, and
 * the only path any generated C comes from. Returns null if the program was rejected. */
export async function compileToC(
  entry: string,
  mode: Mode,
  unit?: string,
): Promise<CompiledC | null> {
  if (!existsSync(entry)) {
    throw new BuildError('STA0007', `entry file "${entry}" does not exist`);
  }

  const {
    program,
    diagnostics: programDiagnostics,
    runtimeDynamicSymbols,
  } = withSpan('frontend/program', {}, () => createProgram(entry, mode));
  if (await report(programDiagnostics)) {
    return null;
  }

  if (await report(withSpan('frontend/gate', {}, () => gateProgram(program, mode)))) {
    return null;
  }

  // Mirrors createProgram's normalization: the program stores the entry under its ABSOLUTE
  // forward-slash name, whatever spelling the command line used.
  const entryFile = program.getSourceFile(resolve(entry).replace(/\\/g, '/'));
  if (entryFile === undefined) {
    throw new BuildError('STA0007', `entry file "${entry}" does not exist`);
  }

  // The C-visible set behind `--emit-header` (Task 7.2 steps 1–2): refusals stop the build
  // before the lowering, so no object or header is written for a unit C cannot see.
  let header: string | undefined;
  let library: LibraryEmit | undefined;
  if (unit !== undefined) {
    const unitExports = withSpan('frontend/export', {}, () =>
      collectUnitExports(entryFile, program.getTypeChecker(), unit, mode),
    );
    if (await report(unitExports.diagnostics)) {
      return null;
    }
    header = renderHeader(unitExports);
    library = { unit, exports: unitExports };
  }

  // The module graph: every reachable file, dependencies first, cycles refused (STA3001). The
  // whole-program merge happens in the LOWERING -- the graph only decides membership and order.
  const { order, diagnostics: graphDiagnostics } = withSpan('frontend/module-graph', {}, () =>
    moduleOrder(program, entryFile, mode),
  );
  if (await report(graphDiagnostics)) {
    return null;
  }

  const { module, diagnostics: lowerDiagnostics } = withSpan('lower', {}, () =>
    lowerProgram(order, program.getTypeChecker(), runtimeDynamicSymbols, mode),
  );
  if ((await report(lowerDiagnostics)) || module === null) {
    return null;
  }

  // Optimization runs BEFORE the verifier, so the verifier checks what the emitter will actually
  // see. A pass that produced ill-typed HIR would otherwise pass through a verifier that had only
  // inspected the lowering's output. A library build roots the shake at its C-visible exports:
  // nothing in the module names them, so without roots an exported-but-uncalled function would
  // be shaken away from under its own stub (plan.md §10 Task 7.2 step 3).
  const exportRoots = library === undefined ? [] : library.exports.functions.map((fn) => fn.name);
  const optimized = withSpan('passes/optimize', {}, () => optimize(module, exportRoots));

  // The verifier is not an optional debug pass: it is the only thing standing between a lowering
  // bug and silently wrong generated C, and it costs one tree walk.
  const problems = withSpan('hir/verify', {}, () => verifyHir(optimized));
  if (problems.length > 0) {
    await emitDiagnosticLines([
      ...problems.map((p) => ({
        text: `stator: ${p.code} internal error in ${p.kind}: ${p.message}`,
        color: INK_COLORS.error,
      })),
      { text: 'stator: this is a compiler bug — please report it with the input' },
    ]);
    return null;
  }

  return withSpan('codegen/emit-c', {}, () => ({
    // With `--emit-header` the object also defines the ABI-identity symbol the header
    // declares (plan §10 Task 7.2 step 7): same unit, same compiler constant, so the two
    // always agree — and a header from another build names a symbol this object lacks. The
    // init, stubs, and error cell ride `library` into the emitter, which owns the module's
    // slot layout and so is the only stage that can place them (steps 3–5).
    c: emitC(optimized, library) + (unit === undefined ? '' : exportVersionDefinition(unit)),
    linkFlags: withSpan('frontend/link-flags', {}, () => collectLinkFlags(program)),
    ...(header !== undefined && { header }),
  }));
}

/** Prints diagnostics and reports whether any of them stops the build. `not-yet` and `never` are
 * both rejections — the difference is what the user should do about it, not whether it compiles. */
async function report(diagnostics: readonly Diagnostic[]): Promise<boolean> {
  await emitDiagnosticLines(diagnosticLines(diagnostics));
  return diagnostics.length > 0;
}

function linkExecutable(
  cPath: string,
  out: string,
  opt: OptLevel,
  externFlags: readonly string[],
): void {
  withSpan('link/clang', {}, () => {
    link(cPath, out, opt, externFlags);
  });
}

/** Duplicate `-l` libraries dropped, first occurrence wins, everything else verbatim in order
 * (docs/FFI.md §9): several binding files for one library each name it, and the CLI escape
 * hatch may repeat one — while a "helpful" sort, or any reordering at all, breaks static
 * archives whose order is load-bearing. Only `-l` dedups: `-L` paths and object files are
 * idempotent to repeat, and grouping flags (`-Wl,--start-group` … `--end-group`) pass
 * through untouched for the rare circular archive. */
export function dedupLinkLibs(flags: readonly string[]): string[] {
  const seen = new Set<string>();
  const kept: string[] = [];
  for (const flag of flags) {
    if (flag.startsWith('-l') && flag.length > 2) {
      if (seen.has(flag)) {
        continue;
      }
      seen.add(flag);
    }
    kept.push(flag);
  }
  return kept;
}

// conda-clang 21.1.8's Darwin ASan runtime deadlocks during dyld's early malloc
// initialization on the current macOS host. Match justfile's sanitizer fallback so the
// generated golden binaries use the same compiler as the sanitized runtime archive. An
// explicit compiler-path CC remains authoritative for callers testing another toolchain.
function selectCC(): string {
  return (
    process.env['CC'] ??
    (SANITIZED && process.platform === 'darwin' && existsSync('/usr/bin/clang')
      ? '/usr/bin/clang'
      : 'clang')
  );
}

/** The two clang failures that mean the same thing however clang was invoked: a missing
 * toolchain (STA0008 — the one build failure with an actionable fix and a per-platform
 * install hint) and a spawn that died before compiling (STA0009). A nonzero EXIT is the
 * caller's to interpret — the link names its extern flags there, the object compile reports
 * a compiler bug — so this answers only the start. Returns undefined when clang ran. */
function clangStartError(cc: string, result: { error?: Error }): BuildError | undefined {
  const { error } = result;
  if (error !== undefined && 'code' in error && error.code === 'ENOENT') {
    return new BuildError(
      'STA0008',
      `C compiler "${cc}" not found — install clang ` +
        '(`mise install`, or macOS: `xcode-select --install`; Debian/Ubuntu: `apt install clang`) or set `CC`',
    );
  }
  if (error !== undefined) {
    return new BuildError('STA0009', `C compiler failed to start: ${error.message}`);
  }
  return undefined;
}

/** One place owning how clang runs: inherited stdio, so a failing compile shows its own
 * errors rather than routing them through a diagnostic. */
function runClang(cc: string, args: readonly string[]) {
  return spawnSync(cc, args, { stdio: ['ignore', 'inherit', 'inherit'] });
}

/** Compile generated C to a relocatable object for a C consumer (`--emit-header`, plan §10
 * Task 7.2 step 1): `clang -c`, so `-o` names an object, not an executable. No archive, no
 * link flags — linking is the consumer's job once steps 3–5 emit the stubs and the init. */
function compileObject(cPath: string, out: string, opt: OptLevel): void {
  const cc = selectCC();
  const result = runClang(cc, [
    '-std=c11',
    ...(SANITIZED ? SANITIZER_FLAGS : [`-O${String(opt)}`]),
    '-I',
    RUNTIME_INCLUDE,
    '-c',
    cPath,
    '-o',
    out,
  ]);
  const startError = clangStartError(cc, result);
  if (startError !== undefined) {
    throw startError;
  }
  if (result.status !== 0) {
    throw new BuildError(
      'STA0009',
      `C compiler failed (exit ${result.status ?? 'signal'}) — this is a compiler bug; ` +
        'keep the C with `--keep-c` and report it',
    );
  }
}

function link(cPath: string, out: string, opt: OptLevel, externFlags: readonly string[]): void {
  if (!existsSync(RUNTIME_ARCHIVE)) {
    throw new BuildError(
      'STA0011',
      `runtime archive not found at ${RUNTIME_ARCHIVE} — run \`just -f ${join(RUNTIME_ROOT, 'justfile')} -d ${RUNTIME_ROOT} ${RUNTIME_JUST_RECIPE[FLAVOR]}\``,
    );
  }

  // conda-clang 21.1.8's Darwin ASan runtime deadlocks during dyld's early malloc
  // initialization on the current macOS host (see selectCC above).
  const cc = selectCC();
  // Tree-shaking builtins (plan.md Task 3.12): builtins live in libjsrt.a, and the archive links
  // at .o granularity -- one referenced symbol drags in every builtin its object file holds. The
  // linker's dead-stripping restores function granularity: a builtin the program never references
  // is not in the binary. Mach-O strips per-symbol out of the box; ELF needs the sections split at
  // compile time (the justfile does the same for the archive's own objects). Sanitized
  // builds skip it -- ASan's global registration arrays are exactly the kind of unreferenced
  // section --gc-sections is documented to break.
  const shakeFlags = SANITIZED
    ? []
    : process.platform === 'darwin'
      ? ['-Wl,-dead_strip']
      : ['-ffunction-sections', '-fdata-sections', '-Wl,--gc-sections'];
  const result = runClang(cc, [
    '-std=c11',
    ...(SANITIZED ? SANITIZER_FLAGS : [`-O${String(opt)}`]),
    ...shakeFlags,
    '-I',
    RUNTIME_INCLUDE,
    cPath,
    '-L',
    RUNTIME_LIB_DIR,
    '-ljsrt',
    // The archive states its own system dependencies in `link-flags.txt` (SYS_LIBS, plan-notes
    // 122). Repeating one here is not a safety net -- it made every link warn about a duplicate.
    // Extern surface flags last, in carrier order (pragma files in program order, then the CLI
    // escape hatch), duplicates dropped first-wins: dependents precede their dependencies.
    ...dedupLinkLibs([...extraLinkFlags(), ...externFlags]),
    '-o',
    out,
  ]);

  const startError = clangStartError(cc, result);
  if (startError !== undefined) {
    throw startError;
  }
  if (result.status !== 0) {
    // A failed link with extern flags is usually a missing library rather than a compiler
    // bug — name the flags so the user knows where to look first.
    if (externFlags.length > 0) {
      throw new BuildError(
        'STA0009',
        `C compiler failed (exit ${result.status ?? 'signal'}) with extern link flags ` +
          `${externFlags.join(' ')} — if a flag names a library that is not installed, install ` +
          'it or fix the @statorLink pragma / --link= value; otherwise keep the C with ' +
          '`--keep-c` and report it',
      );
    }
    throw new BuildError(
      'STA0009',
      `C compiler failed (exit ${result.status ?? 'signal'}) — this is a compiler bug; ` +
        'keep the C with `--keep-c` and report it',
    );
  }
}
