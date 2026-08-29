import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BuildError, build } from './build.ts';
import { explain } from './explain.ts';

type Mode = 'ts' | 'js';

type Command =
  | { kind: 'help' }
  | { kind: 'version' }
  | { kind: 'build'; entry: string; out: string; mode: Mode; emitC: boolean; keepC: boolean }
  | { kind: 'explain'; entry: string; mode: Mode; json: boolean };

const USAGE = `stator — ahead-of-time compiler for TypeScript/JavaScript

Usage:
  stator build <entry> -o <out> [--mode=ts|js] [--emit=c] [--keep-c]
  stator explain <entry> [--mode=ts|js] [--json]
  stator --version
  stator --help

Modes:
  ts  (default)  strict static TypeScript; .ts only; explicit any is an error
  js             JavaScript, or JS + TS mixed; untyped code compiles dynamically
`;

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
    return { kind: 'help' };
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
    if (arg === '-o') {
      const next = argv[i + 1];
      if (next === undefined) {
        throw new StatorError('STA0004', '-o requires an output path');
      }
      out = next;
      i += 1;
    } else if (arg.startsWith('--mode=')) {
      mode = parseMode(arg.slice('--mode='.length));
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

function run(command: Command): void {
  switch (command.kind) {
    case 'help':
      process.stdout.write(USAGE);
      return;
    case 'version':
      process.stdout.write(`${readVersion()}\n`);
      return;
    case 'build':
      process.exitCode = build({
        entry: command.entry,
        out: command.out,
        mode: command.mode,
        emitCOnly: command.emitC,
        keepC: command.keepC,
      });
      return;
    case 'explain':
      process.exitCode = explain(command.entry, command.mode, command.json);
      return;
  }
}

function main(): void {
  try {
    run(parse(process.argv.slice(2)));
  } catch (error) {
    // Two error types, one rendering: BuildError is raised below the CLI layer but carries the
    // same contract -- a stable code and a message the user can act on (AGENTS.md).
    if (error instanceof StatorError || error instanceof BuildError) {
      process.stderr.write(`stator: ${error.code} ${error.message}\n`);
      process.exitCode = 1;
      return;
    }
    throw error;
  }
}

main();
