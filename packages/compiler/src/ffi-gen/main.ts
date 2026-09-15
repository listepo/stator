/** `stator ffi-gen` (plan.md §10 Task 7.3 steps 3–5): C header → Stator `.d.ts`.
 *
 *  Usage:
 *    node packages/compiler/src/ffi-gen/main.ts <header.h> [--out=<file.d.ts>]
 *      [--diff=<handwritten.d.ts>] [--clang=<cc>] [--lib=<name>]... [-I<dir>]... [-D<def>]...
 *
 *  `--lib` is repeatable: each value emits one `// @statorLink: -l<name>` line at the
 *  top of the `.d.ts` (in command-line order). The `#include` pragma always names the
 *  input header's basename. A second positional header is an error: one binding wraps
 *  one header, so the first input wins by construction.
 *
 *  No `--out` prints the `.d.ts` to stdout (diagnostics and the summary go to stderr, so the
 *  stdout stream stays a clean committable file). `--diff` prints the oracle report instead
 *  (plus writing `--out` when both are given). Exit codes: 0 success, 2 bad arguments,
 *  1/3/4 clang/parse/IO failures. Deliberately NOT wired into the build pipeline or CI —
 *  that is the follow-up's decision (oracle findings in the task report first).
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { runClangAstDump } from './ast.ts';
import { diffBindings, readHandwritten, renderDiffReport } from './diff.ts';
import { diagnosticLine, generate, renderDts, summaryLine } from './emit.ts';
import { buildModel } from './model.ts';

interface Options {
  readonly header: string;
  readonly out: string | undefined;
  readonly diff: string | undefined;
  readonly clang: string;
  readonly libs: readonly string[];
  readonly extraArgs: readonly string[];
}

function usage(): string {
  return (
    'usage: ffi-gen/main.ts <header.h> [--out=<file.d.ts>] [--diff=<handwritten.d.ts>] ' +
    '[--clang=<cc>] [--lib=<name>]... [-I<dir>]... [-D<def>]...'
  );
}

function parseArgs(argv: readonly string[]): Options {
  let header: string | undefined;
  let out: string | undefined;
  let diff: string | undefined;
  let clang = process.env['CC'] ?? 'clang';
  const libs: string[] = [];
  const extraArgs: string[] = [];
  for (const arg of argv) {
    if (arg === '--help' || arg === '-h') {
      throw new Error(usage());
    } else if (arg.startsWith('--out=')) {
      out = arg.slice('--out='.length);
    } else if (arg.startsWith('--diff=')) {
      diff = arg.slice('--diff='.length);
    } else if (arg.startsWith('--clang=')) {
      clang = arg.slice('--clang='.length);
    } else if (arg.startsWith('--lib=')) {
      libs.push(arg.slice('--lib='.length));
    } else if (arg.startsWith('-I') || arg.startsWith('-D')) {
      extraArgs.push(arg);
    } else if (arg.startsWith('-')) {
      throw new Error(`ffi-gen: unknown flag '${arg}'\n${usage()}`);
    } else if (header === undefined) {
      header = arg;
    } else {
      throw new Error(`ffi-gen: unexpected positional argument '${arg}'\n${usage()}`);
    }
  }
  if (header === undefined) {
    throw new Error(`ffi-gen: no header given\n${usage()}`);
  }
  if (out === '' || diff === '' || clang === '' || libs.some((lib) => lib === '')) {
    throw new Error(`ffi-gen: empty flag value\n${usage()}`);
  }
  return { header, out, diff, clang, libs, extraArgs };
}

function main(): number {
  let options: Options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    return 2;
  }
  let headerText: string;
  try {
    headerText = readFileSync(options.header, 'utf8');
  } catch {
    process.stderr.write(`ffi-gen: cannot read header '${options.header}'\n`);
    return 4;
  }
  let root;
  try {
    root = runClangAstDump(options.clang, options.header, options.extraArgs).root;
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }
  let result;
  try {
    result = generate(buildModel(root, options.header, headerText, process.cwd()));
  } catch (error) {
    process.stderr.write(
      `ffi-gen: internal error: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    return 3;
  }
  const dts = renderDts(result, options.libs);
  if (options.diff !== undefined) {
    let handText: string;
    try {
      handText = readFileSync(options.diff, 'utf8');
    } catch {
      process.stderr.write(`ffi-gen: cannot read handwritten file '${options.diff}'\n`);
      return 4;
    }
    const hand = readHandwritten(handText, options.diff);
    process.stdout.write(
      renderDiffReport(diffBindings(result, hand), options.header, options.diff),
    );
  }
  if (options.out !== undefined) {
    try {
      writeFileSync(options.out, dts);
    } catch {
      process.stderr.write(`ffi-gen: cannot write '${options.out}'\n`);
      return 4;
    }
  } else if (options.diff === undefined) {
    process.stdout.write(dts);
  }
  for (const refusal of result.refusals) {
    process.stderr.write(`${diagnosticLine(result.basename, refusal)}\n`);
  }
  process.stderr.write(`${summaryLine(result)}\n`);
  return 0;
}

process.exit(main());
