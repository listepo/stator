import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as dotenvConfig } from 'dotenv';
import { telemetryInit, telemetryShutdown, withSpanAsync } from '../support/telemetry.ts';
import { BuildError, build, internalErrorMessage, type OptLevel } from './build.ts';
import {
  type CliOptions,
  type ConfigChoice,
  loadConfig,
  resolveOptions,
  splitFlags,
} from './config.ts';
import { explain } from './explain.ts';
import { INK_COLORS, print } from './render.ts';

type Mode = 'ts' | 'js';

type Command =
  | { kind: 'help'; command: 'top' | 'build' | 'explain' }
  | { kind: 'version' }
  | {
      kind: 'build';
      entry: string;
      out: string;
      mode: Mode;
      emitC: boolean;
      keepC: boolean;
      opt: OptLevel;
      linkFlags: readonly string[];
      emitHeader: string | undefined;
      unitName: string | undefined;
    }
  | { kind: 'explain'; entry: string; mode: Mode; json: boolean };

const USAGE = `stator — ahead-of-time compiler for TypeScript/JavaScript

Usage:
  stator build <entry> -o <out> [--mode=ts|js] [--emit=c] [--keep-c]
    [--opt=0|1|2|3] [--link=<flags>]... [--emit-header=<h> [--unit-name=<unit>]]
  stator explain <entry> [--mode=ts|js] [--json]
  stator <command> --help
  stator --version
  stator --help

Modes:
  ts  (default)  strict static TypeScript; .ts only; explicit any is an error
  js             JavaScript, or JS + TS mixed; untyped code goes dynamic

Config:
  Every option can also come from ./stator.config.json (docs/CONFIG.md);
  the command line wins. --config=<path> reads another file, --no-config
  reads none.
`;

/** Per-command help, after oclif's convention: `<command> --help` documents that command's flags,
 * not the whole CLI. Lines stay under 76 columns: ink wraps at the terminal width, so a help line
 * that fits the fallback width reads the same on a TTY and on a pipe (plan-notes 187). */
const COMMAND_USAGE = {
  build: `Usage:
  stator build <entry> -o <out> [--mode=ts|js] [--emit=c] [--keep-c]
    [--opt=0|1|2|3] [--link=<flags>]... [--emit-header=<h> [--unit-name=<unit>]]

Flags:
  -o, --out <out>  output path: native binary, or C with --emit=c
  --mode ts|js     strict ts (default) or dynamic js; diagnostics only
  --emit=c         stop after writing C to <out>; skip the C compiler
  --keep-c         keep the intermediate .c next to the binary
  --opt 0|1|2|3    clang -O level (default 2; or STATOR_OPT)
  --link <flags>   extra clang link flags (repeatable; splits on spaces);
                   joins the @statorLink pragma flags (docs/FFI.md)
  --emit-header <h> write a C header for the unit's exports (docs/FFI.md);
                   -o names a relocatable object, not an executable
  --unit-name <unit> prefix for stator_<unit>_<name> (default: entry basename)
  --emit=binary    build a binary (default; overrides "emit": "c")
  --config <path>  read options from this JSON file (default:
                   ./stator.config.json when it exists; docs/CONFIG.md)
  --no-config      ignore stator.config.json
`,
  explain: `Usage:
  stator explain <entry> [--mode=ts|js] [--json]

Reports the file verdict: static | dynamic | error | not-yet, with the
STA code and every diagnostic that decided it, then the static/dynamic
split per function. A rejected program still exits 0 — the verdict is
the answer, so a refusal is a result, not a crash.

Flags:
  --mode ts|js     strict ts (default) or dynamic js
  --json           machine-readable report (used by the decision tests);
                   --diagnostics=text|json spells the same choice
  --config <path>  read options from this JSON file (default:
                   ./stator.config.json when it exists; docs/CONFIG.md)
  --no-config      ignore stator.config.json
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

function parseOpt(raw: string): OptLevel {
  if (raw === '0' || raw === '1' || raw === '2' || raw === '3') {
    return Number(raw) as OptLevel;
  }
  throw new StatorError('STA0002', `unknown opt "${raw}" (expected 0, 1, 2, or 3)`);
}

/** `STATOR_OPT`, below `--opt` and above the config file (Task 6.18 step 3). */
function envOpt(): OptLevel | undefined {
  const env = process.env['STATOR_OPT'];
  if (env === undefined || env === '') {
    return undefined;
  }
  return parseOpt(env);
}

/** One `--link` value into clang flags: whitespace-separated, so `--link="-lsqlite3 -L/x"`
 * and two `--link` occurrences spell the same line. Empty is a user error, not an empty flag:
 * it almost always means an unexpanded `$VAR`, and an invisible no-op would hide that. */
function splitLinkFlags(raw: string): string[] {
  const flags = splitFlags(raw);
  if (flags.length === 0) {
    throw new StatorError('STA0004', '--link requires a value (clang link flags)');
  }
  return flags;
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

  const cli: CliOptions = {
    entry: undefined,
    out: undefined,
    mode: undefined,
    opt: undefined,
    link: [],
    emit: undefined,
    keepC: undefined,
    emitHeader: undefined,
    unitName: undefined,
    diagnostics: undefined,
  };
  const linkFlags: string[] = [];
  let configChoice: ConfigChoice = { kind: 'discover' };

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
      cli.out = next;
      i += 1;
    } else if (arg.startsWith('--mode=')) {
      cli.mode = parseMode(arg.slice('--mode='.length));
    } else if (arg === '--mode') {
      const next = argv[i + 1];
      if (next === undefined) {
        throw new StatorError('STA0004', '--mode requires a value (ts or js)');
      }
      cli.mode = parseMode(next);
      i += 1;
    } else if (arg === '--json' || arg === '--diagnostics=json') {
      cli.diagnostics = 'json';
    } else if (arg === '--diagnostics=text') {
      cli.diagnostics = 'text';
    } else if (arg === '--emit=c') {
      cli.emit = 'c';
    } else if (arg === '--emit=binary') {
      cli.emit = 'binary';
    } else if (arg === '--keep-c') {
      cli.keepC = true;
    } else if (arg.startsWith('--config=')) {
      const value = arg.slice('--config='.length);
      if (value === '') {
        throw new StatorError('STA0004', '--config requires a value (config file path)');
      }
      configChoice = { kind: 'path', path: value };
    } else if (arg === '--config') {
      const next = argv[i + 1];
      if (next === undefined) {
        throw new StatorError('STA0004', '--config requires a value (config file path)');
      }
      configChoice = { kind: 'path', path: next };
      i += 1;
    } else if (arg === '--no-config') {
      configChoice = { kind: 'none' };
    } else if (arg.startsWith('--opt=')) {
      cli.opt = parseOpt(arg.slice('--opt='.length));
    } else if (arg === '--opt') {
      const next = argv[i + 1];
      if (next === undefined) {
        throw new StatorError('STA0004', '--opt requires a value (0, 1, 2, or 3)');
      }
      cli.opt = parseOpt(next);
      i += 1;
    } else if (arg.startsWith('--link=')) {
      linkFlags.push(...splitLinkFlags(arg.slice('--link='.length)));
    } else if (arg === '--link') {
      const next = argv[i + 1];
      if (next === undefined) {
        throw new StatorError('STA0004', '--link requires a value (clang link flags)');
      }
      linkFlags.push(...splitLinkFlags(next));
      i += 1;
    } else if (arg.startsWith('--emit-header=')) {
      const value = arg.slice('--emit-header='.length);
      if (value === '') {
        throw new StatorError('STA0004', '--emit-header requires a value (output header path)');
      }
      cli.emitHeader = value;
    } else if (arg === '--emit-header') {
      const next = argv[i + 1];
      if (next === undefined) {
        throw new StatorError('STA0004', '--emit-header requires a value (output header path)');
      }
      cli.emitHeader = next;
      i += 1;
    } else if (arg.startsWith('--unit-name=')) {
      const value = arg.slice('--unit-name='.length);
      if (value === '') {
        throw new StatorError('STA0004', '--unit-name requires a value (C identifier prefix)');
      }
      cli.unitName = value;
    } else if (arg === '--unit-name') {
      const next = argv[i + 1];
      if (next === undefined) {
        throw new StatorError('STA0004', '--unit-name requires a value (C identifier prefix)');
      }
      cli.unitName = next;
      i += 1;
    } else if (arg.startsWith('-')) {
      throw new StatorError('STA0005', `unknown flag "${arg}"`);
    } else if (cli.entry === undefined) {
      cli.entry = arg;
    } else {
      throw new StatorError('STA0006', `unexpected argument "${arg}"`);
    }
  }

  // Read after the scan, so `--help` and an unknown flag never touch the file.
  const options = resolveOptions(
    { ...cli, link: linkFlags },
    { opt: envOpt() },
    loadConfig(configChoice, process.cwd()),
  );
  const { entry, out, mode } = options;
  if (entry === undefined) {
    throw new StatorError('STA0004', `"${head}" requires an entry file`);
  }
  if (head === 'build') {
    if (out === undefined) {
      throw new StatorError('STA0004', 'build requires -o <out>');
    }
    return {
      kind: 'build',
      entry,
      out,
      mode,
      emitC: options.emit === 'c',
      keepC: options.keepC,
      opt: options.opt,
      linkFlags: options.link,
      emitHeader: options.emitHeader,
      unitName: options.unitName,
    };
  }
  return { kind: 'explain', entry, mode, json: options.diagnostics === 'json' };
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
        opt: command.opt,
        linkFlags: command.linkFlags,
        ...(command.emitHeader !== undefined && { emitHeader: command.emitHeader }),
        ...(command.unitName !== undefined && { unitName: command.unitName }),
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
    // Everything else is a compiler bug, and the contract for one is a diagnostic -- never a raw
    // Node stack trace (AGENTS.md: "A thrown exception reaching the CLI is a compiler bug"). The
    // TypeScript checker's own stack overflow does not land here: `createProgram` names it STA0013,
    // because plain `tsc` dies on the same input (plan-notes 287). Naming the crash is the honest
    // answer, and the message asks for the input so the next step can be a real fix.
    await print(
      [
        {
          text: `stator: STA4072 ${internalErrorMessage(error)}`,
          color: INK_COLORS.error,
        },
      ],
      process.stderr,
    );
    process.exitCode = 1;
  } finally {
    await telemetryShutdown();
  }
}

await main();
