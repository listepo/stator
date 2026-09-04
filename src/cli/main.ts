import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as dotenvConfig } from 'dotenv';
import { telemetryInit, telemetryShutdown, withSpanAsync } from '../support/telemetry.ts';
import { BuildError, build } from './build.ts';
import { explain } from './explain.ts';
import { INK_COLORS, print } from './render.ts';

type Mode = 'ts' | 'js';

type Command =
  | { kind: 'help'; command: 'top' | 'build' | 'explain' }
  | { kind: 'version' }
  | { kind: 'build'; entry: string; out: string; mode: Mode; emitC: boolean; keepC: boolean }
  | { kind: 'explain'; entry: string; mode: Mode; json: boolean };

const USAGE = `stator — ahead-of-time compiler for TypeScript/JavaScript

Usage:
  stator build <entry> -o <out> [--mode=ts|js] [--emit=c] [--keep-c]
  stator explain <entry> [--mode=ts|js] [--json]
  stator <command> --help
  stator --version
  stator --help

Modes:
  ts  (default)  strict static TypeScript; .ts only; explicit any is an error
  js             JavaScript, or JS + TS mixed; untyped code goes dynamic
`;

/** Per-command help, after oclif's convention: `<command> --help` documents that command's flags,
 * not the whole CLI. Lines stay under 76 columns: ink wraps at the terminal width, so a help line
 * that fits the fallback width reads the same on a TTY and on a pipe (plan-notes 187). */
const COMMAND_USAGE = {
  build: `Usage:
  stator build <entry> -o <out> [--mode=ts|js] [--emit=c] [--keep-c]

Flags:
  -o, --out <out>  output path: native binary, or C with --emit=c
  --mode ts|js     strict ts (default) or dynamic js; diagnostics only
  --emit=c         stop after writing C to <out>; skip the C compiler
  --keep-c         keep the intermediate .c next to the binary
`,
  explain: `Usage:
  stator explain <entry> [--mode=ts|js] [--json]

Reports the verdict per construct: static | dynamic | error | not-yet,
with the STA code. A rejected program still exits 0 — the verdict is
the answer, so a refusal is a result, not a crash.

Flags:
  --mode ts|js     strict ts (default) or dynamic js
  --json           machine-readable report (used by the decision tests)
`,
} as const;

/** User-facing failure. Carries a stable STA code; never a raw stack trace (AGENTS.md). */
class StatorError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = 'StatorError';
  }
}

function readVersion(): string {
  const pkgPath = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'package.json');
  const parsed: unknown = JSON.parse(readFileSync(pkgPath, 'utf8'));
  if (
    typeof parsed === 'object' &&
    parsed !== null &&
    'version' in parsed &&
    typeof parsed.version === 'string'
  ) {
    return parsed.version;
  }
  throw new StatorError('STA4001', 'package.json has no readable "version" field');
}

function parseMode(raw: string): Mode {
  if (raw === 'ts' || raw === 'js') {
    return raw;
  }
  throw new StatorError('STA0002', `unknown mode "${raw}" (expected "ts" or "js")`);
}

function parse(argv: readonly string[]): Command {
  const head = argv[0];
  if (head === undefined || head === '--help' || head === '-h') {
    return { kind: 'help', command: 'top' };
  }
  if (head === '--version' || head === '-v') {
    return { kind: 'version' };
  }
  if (head !== 'build' && head !== 'explain') {
    throw new StatorError('STA0003', `unknown command "${head}" (expected "build" or "explain")`);
  }

  let entry: string | undefined;
  let out: string | undefined;
  let mode: Mode = 'ts';
  let json = false;
  let emitC = false;
  let keepC = false;

  for (let i = 1; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === undefined) {
      continue;
    }
    if (arg === '--help' || arg === '-h') {
      return { kind: 'help', command: head };
    }
    if (arg === '-o' || arg === '--out') {
      const next = argv[i + 1];
      if (next === undefined) {
        throw new StatorError('STA0004', `${arg} requires an output path`);
      }
      out = next;
      i += 1;
    } else if (arg.startsWith('--mode=')) {
      mode = parseMode(arg.slice('--mode='.length));
    } else if (arg === '--mode') {
      const next = argv[i + 1];
      if (next === undefined) {
        throw new StatorError('STA0004', '--mode requires a value (ts or js)');
      }
      mode = parseMode(next);
      i += 1;
    } else if (arg === '--json' || arg === '--diagnostics=json') {
      json = true;
    } else if (arg === '--emit=c') {
      emitC = true;
    } else if (arg === '--keep-c') {
      keepC = true;
    } else if (arg.startsWith('-')) {
      throw new StatorError('STA0005', `unknown flag "${arg}"`);
    } else if (entry === undefined) {
      entry = arg;
    } else {
      throw new StatorError('STA0006', `unexpected argument "${arg}"`);
    }
  }

  if (entry === undefined) {
    throw new StatorError('STA0004', `"${head}" requires an entry file`);
  }
  if (head === 'build') {
    if (out === undefined) {
      throw new StatorError('STA0004', 'build requires -o <out>');
    }
    return { kind: 'build', entry, out, mode, emitC, keepC };
  }
  return { kind: 'explain', entry, mode, json };
}

async function run(command: Command): Promise<void> {
  const spanName =
    command.kind === 'help' || command.kind === 'version'
      ? `stator --${command.kind}`
      : `stator ${command.kind}`;
  const attrs =
    command.kind === 'build' || command.kind === 'explain'
      ? { 'stator.mode': command.mode, 'stator.entry': command.entry }
      : {};
  await withSpanAsync(spanName, attrs, () => runCommand(command));
}

async function runCommand(command: Command): Promise<void> {
  switch (command.kind) {
    case 'help': {
      const usage = command.command === 'top' ? USAGE : COMMAND_USAGE[command.command];
      // `usage` ends with '\n' — the CLI's trailing-newline contract — but `print` adds its own,
      // so hand ink the text without it rather than double-space the end of help.
      await print([{ text: usage.trimEnd() }], process.stdout);
      return;
    }
    case 'version':
      await print([{ text: readVersion() }], process.stdout);
      return;
    case 'build':
      process.exitCode = await build({
        entry: command.entry,
        out: command.out,
        mode: command.mode,
        emitCOnly: command.emitC,
        keepC: command.keepC,
      });
      return;
    case 'explain':
      process.exitCode = await explain(command.entry, command.mode, command.json);
      return;
  }
}

async function main(): Promise<void> {
  // .env before anything reads the environment (STATOR_OTEL, OTEL_EXPORTER_OTLP_*). dotenv never
  // overrides real environment variables, and `quiet` keeps its banner out of the byte-exact
  // stdout contract (dotenv 17 logs by default).
  dotenvConfig({ quiet: true });
  await telemetryInit();
  try {
    await run(parse(process.argv.slice(2)));
  } catch (error) {
    // Two error types, one rendering: BuildError is raised below the CLI layer but carries the
    // same contract -- a stable code and a message the user can act on (AGENTS.md).
    if (error instanceof StatorError || error instanceof BuildError) {
      await print(
        [{ text: `stator: ${error.code} ${error.message}`, color: INK_COLORS.error }],
        process.stderr,
      );
      process.exitCode = 1;
      return;
    }
    throw error;
  } finally {
    await telemetryShutdown();
  }
}

await main();
