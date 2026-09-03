/** The build driver: source -> program -> gate -> HIR -> C -> clang -> executable (plan.md §5
 * Task 2.4).
 *
 * Everything policy-shaped lives above this file. The driver's own job is only sequencing and
 * process control, and it stops at the FIRST stage that produced diagnostics: continuing past a
 * rejected gate would hand the lowering source it already refused, and every diagnostic after that
 * would be a consequence of the first one rather than a fact about the program.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { emitC } from '../codegen/index.ts';
import { gateProgram } from '../frontend/gate.ts';
import { moduleOrder } from '../frontend/graph.ts';
import { createProgram } from '../frontend/program.ts';
import { verifyHir } from '../hir/verify.ts';
import { lowerProgram } from '../lower/index.ts';
import { optimize } from '../passes/index.ts';
import type { Diagnostic } from '../support/diagnostics.ts';
import { renderDiagnostic } from '../support/diagnostics.ts';
import { runtimeFlavor } from '../support/features.ts';

type Mode = 'ts' | 'js';

export interface BuildOptions {
  readonly entry: string;
  readonly out: string;
  readonly mode: Mode;
  /** Stop after writing C to `out` instead of invoking the C compiler. */
  readonly emitCOnly: boolean;
  /** Keep the intermediate .c next to the executable instead of deleting it. */
  readonly keepC: boolean;
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

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const RUNTIME_INCLUDE = join(REPO_ROOT, 'runtime', 'include');

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
const RUNTIME_LIB_DIR = join(REPO_ROOT, 'runtime', RUNTIME_DIR_OF[FLAVOR]);
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
export function build(options: BuildOptions): number {
  const c = compileToC(options.entry, options.mode);
  if (c === null) {
    return 1;
  }

  if (options.emitCOnly) {
    writeFileSync(options.out, c, 'utf8');
    return 0;
  }

  // The .c goes beside the executable when it is being kept, so `--keep-c` produces a file the
  // user can actually find; otherwise it lives in a temp dir that is removed on every exit path.
  const scratch = options.keepC ? null : mkdtempSync(join(tmpdir(), 'stator-'));
  const cPath = options.keepC ? `${options.out}.c` : join(scratch ?? '', 'module.c');

  try {
    writeFileSync(cPath, c, 'utf8');
    linkExecutable(cPath, options.out);
    return 0;
  } finally {
    if (scratch !== null) {
      rmSync(scratch, { recursive: true, force: true });
    }
  }
}

/** The pure half: source text in, C text out, diagnostics to stderr. Shared with `explain`, and
 * the only path any generated C comes from. Returns null if the program was rejected. */
export function compileToC(entry: string, mode: Mode): string | null {
  if (!existsSync(entry)) {
    throw new BuildError('STA0007', `entry file "${entry}" does not exist`);
  }

  const {
    program,
    diagnostics: programDiagnostics,
    runtimeDynamicSymbols,
  } = createProgram(entry, mode);
  if (report(programDiagnostics)) {
    return null;
  }

  if (report(gateProgram(program, mode))) {
    return null;
  }

  // Mirrors createProgram's normalization: the program stores the entry under its ABSOLUTE
  // forward-slash name, whatever spelling the command line used.
  const entryFile = program.getSourceFile(resolve(entry).replace(/\\/g, '/'));
  if (entryFile === undefined) {
    throw new BuildError('STA0007', `entry file "${entry}" does not exist`);
  }

  // The module graph: every reachable file, dependencies first, cycles refused (STA3001). The
  // whole-program merge happens in the LOWERING -- the graph only decides membership and order.
  const { order, diagnostics: graphDiagnostics } = moduleOrder(program, entryFile, mode);
  if (report(graphDiagnostics)) {
    return null;
  }

  const { module, diagnostics: lowerDiagnostics } = lowerProgram(
    order,
    program.getTypeChecker(),
    runtimeDynamicSymbols,
  );
  if (report(lowerDiagnostics) || module === null) {
    return null;
  }

  // Optimization runs BEFORE the verifier, so the verifier checks what the emitter will actually
  // see. A pass that produced ill-typed HIR would otherwise pass through a verifier that had only
  // inspected the lowering's output.
  const optimized = optimize(module);

  // The verifier is not an optional debug pass: it is the only thing standing between a lowering
  // bug and silently wrong generated C, and it costs one tree walk.
  const problems = verifyHir(optimized);
  if (problems.length > 0) {
    for (const p of problems) {
      process.stderr.write(`stator: ${p.code} internal error in ${p.kind}: ${p.message}\n`);
    }
    process.stderr.write('stator: this is a compiler bug — please report it with the input\n');
    return null;
  }

  return emitC(optimized);
}

/** Prints diagnostics and reports whether any of them stops the build. `not-yet` and `never` are
 * both rejections — the difference is what the user should do about it, not whether it compiles. */
function report(diagnostics: readonly Diagnostic[]): boolean {
  for (const d of diagnostics) {
    process.stderr.write(`${renderDiagnostic(d)}\n`);
  }
  return diagnostics.length > 0;
}

function linkExecutable(cPath: string, out: string): void {
  if (!existsSync(RUNTIME_ARCHIVE)) {
    throw new BuildError(
      'STA0011',
      `runtime archive not found at ${RUNTIME_ARCHIVE} — run \`just ${RUNTIME_JUST_RECIPE[FLAVOR]}\``,
    );
  }

  // conda-clang 21.1.8's Darwin ASan runtime deadlocks during dyld's early malloc
  // initialization on the current macOS host. Match justfile's sanitizer fallback so the
  // generated golden binaries use the same compiler as the sanitized runtime archive. An
  // explicit compiler-path CC remains authoritative for callers testing another toolchain.
  const cc =
    process.env['CC'] ??
    (SANITIZED && process.platform === 'darwin' && existsSync('/usr/bin/clang')
      ? '/usr/bin/clang'
      : 'clang');
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
  const result = spawnSync(
    cc,
    [
      '-std=c11',
      ...(SANITIZED ? SANITIZER_FLAGS : ['-O2']),
      ...shakeFlags,
      '-I',
      RUNTIME_INCLUDE,
      cPath,
      '-L',
      RUNTIME_LIB_DIR,
      '-ljsrt',
      // The archive states its own system dependencies in `link-flags.txt` (SYS_LIBS, plan-notes
      // 122). Repeating one here is not a safety net -- it made every link warn about a duplicate.
      ...extraLinkFlags(),
      '-o',
      out,
    ],
    { stdio: ['ignore', 'inherit', 'inherit'] },
  );

  // ENOENT here means the toolchain is absent, which is the one build failure with an actionable
  // fix -- so it gets its own code and a per-platform install hint rather than a generic failure.
  if (result.error !== undefined && 'code' in result.error && result.error.code === 'ENOENT') {
    throw new BuildError(
      'STA0008',
      `C compiler "${cc}" not found — install clang ` +
        '(`mise install`, or macOS: `xcode-select --install`; Debian/Ubuntu: `apt install clang`) or set `CC`',
    );
  }
  if (result.error !== undefined) {
    throw new BuildError('STA0009', `C compiler failed to start: ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new BuildError(
      'STA0009',
      `C compiler failed (exit ${result.status ?? 'signal'}) — this is a compiler bug; ` +
        'keep the C with `--keep-c` and report it',
    );
  }
}
