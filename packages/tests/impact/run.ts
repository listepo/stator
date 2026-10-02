/* Run only the tests a change reaches (plan.md §9 Task 6.17, plan-notes 293).
 *
 * Usage: node packages/tests/impact/run.ts [--map=<path>] [--dry-run]   (`pnpm run test:impact`)
 *
 * Diffs the working tree (staged, unstaged and untracked) against the commit the impact map was
 * recorded at, asks the selector (support/impact.ts) which tests of which harness that diff can
 * reach, prints the selection with its reasons, then runs it: the selected unit files through
 * vitest, the selected subset and golden fixtures through their runners' `--only=`, and each
 * single-key harness whole. Every reason the map cannot be trusted — none recorded, another Node
 * or platform, a dirty recording, a commit that is not an ancestor — falls back to the full suite
 * and says why. Iteration only: `pnpm run ci` stays the gate.
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { availableParallelism, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { formatSelection, type HarnessName, type HarnessSelection } from '../support/impact.ts';
import {
  ASAN_ENV,
  DEFAULT_MAP,
  REPO,
  RUNNERS,
  VITEST,
  VITEST_CONFIG,
  computeSelection,
  justCommand,
  nodeCommand,
  type Command,
} from './shared.ts';

interface Options {
  readonly map: string;
  readonly dryRun: boolean;
}

function parseArgs(argv: readonly string[]): Options {
  let map = DEFAULT_MAP;
  let dryRun = false;
  for (const arg of argv) {
    if (arg.startsWith('--map=')) map = resolve(arg.slice('--map='.length));
    else if (arg === '--dry-run') dryRun = true;
    else throw new Error(`unknown flag "${arg}" (usage: run.ts [--map=<path>] [--dry-run])`);
  }
  return { map, dryRun };
}

/** The `--only=` list file for one harness, or no flag at all when it runs whole. */
function onlyArgs(tmp: string, selection: HarnessSelection): string[] {
  if (selection.all) return [];
  const file = join(tmp, `${selection.harness}.only`);
  writeFileSync(file, `${selection.keys.join('\n')}\n`, 'utf8');
  return [`--only=${file}`];
}

/** `--shards=N` for an in-process runner: one worker per core, never more than the work. */
function shardArgs(selection: HarnessSelection): string[] {
  const count = selection.all ? selection.total : selection.keys.length;
  const shards = Math.min(availableParallelism(), count);
  return shards > 1 ? [`--shards=${String(shards)}`] : [];
}

/** The commands one selected harness runs, in order. */
function harnessCommands(
  selection: HarnessSelection,
  tmp: string,
  runtimeSelected: boolean,
): Command[] {
  const script = (path: string): string => join(REPO, path);
  switch (selection.harness) {
    case 'unit':
      return [
        {
          label: 'unit',
          command: VITEST,
          args: ['run', '--config', VITEST_CONFIG, ...(selection.all ? [] : selection.keys)],
        },
      ];
    case 'subset':
    case 'golden':
      return [
        nodeCommand(selection.harness, script(RUNNERS[selection.harness]), [
          ...onlyArgs(tmp, selection),
          ...shardArgs(selection),
        ]),
      ];
    case 'asan':
      // The whole gate when everything is selected (it skips itself on an unchanged input hash);
      // otherwise its three stages, with the golden stage narrowed to the selection.
      if (selection.all) return [nodeCommand('asan', script(RUNNERS.asanGate))];
      return [
        justCommand('runtime-asan'),
        ...(runtimeSelected ? [justCommand('runtime-test-asan')] : []),
        nodeCommand('asan', script(RUNNERS.golden), onlyArgs(tmp, selection), ASAN_ENV),
      ];
    case 'runtime':
      return [{ ...justCommand('runtime-test'), label: 'runtime' }];
    case 'leak':
    case 'ffi':
    case 'builtins':
      return [nodeCommand(selection.harness, script(RUNNERS[selection.harness]))];
    case 'node-coverage':
      return [nodeCommand('node-coverage', script(RUNNERS['node-coverage']), ['--check'])];
    default: {
      const exhaustive: never = selection.harness;
      throw new Error(`unhandled harness ${String(exhaustive)}`);
    }
  }
}

/** The order `pnpm run ci` runs them in. */
const ORDER: readonly HarnessName[] = [
  'unit',
  'runtime',
  'subset',
  'golden',
  'builtins',
  'node-coverage',
  'ffi',
  'leak',
  'asan',
];

/** Everything but the subset and unit runners links programs against `libjsrt.a`. */
const LINKS_RUNTIME: ReadonlySet<HarnessName> = new Set([
  'unit',
  'runtime',
  'golden',
  'builtins',
  'ffi',
  'leak',
]);

function main(): number {
  const options = parseArgs(process.argv.slice(2));
  const started = Date.now();
  const { selection } = computeSelection(options.map);
  process.stdout.write(`${formatSelection(selection)}\n`);
  const chosen = ORDER.flatMap((harness) => {
    const picked = selection.harnesses.find((entry) => entry.harness === harness);
    return picked !== undefined && (picked.all || picked.keys.length > 0) ? [picked] : [];
  });
  if (options.dryRun) return 0;
  if (chosen.length === 0) {
    process.stdout.write('impact: nothing to run\n');
    return 0;
  }
  const runtimeSelected = chosen.some((entry) => entry.harness === 'runtime');
  const commands: Command[] = [];
  if (chosen.some((entry) => LINKS_RUNTIME.has(entry.harness))) {
    commands.push(justCommand('runtime'));
  }
  const tmp = mkdtempSync(join(tmpdir(), 'stator-impact-run-'));
  const timings: string[] = [];
  let failed = 0;
  try {
    for (const entry of chosen) commands.push(...harnessCommands(entry, tmp, runtimeSelected));
    for (const command of commands) {
      const t0 = Date.now();
      process.stdout.write(`\nimpact: ${command.label}\n`);
      const result = spawnSync(command.command, [...command.args], {
        cwd: REPO,
        stdio: 'inherit',
        env: { ...process.env, ...command.env },
      });
      const seconds = ((Date.now() - t0) / 1000).toFixed(1);
      const ok = result.status === 0;
      if (!ok) failed += 1;
      timings.push(`  ${ok ? 'ok  ' : 'FAIL'} ${command.label.padEnd(24)} ${seconds} s`);
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
  process.stdout.write(
    `\nimpact: ${String(commands.length)} step(s), ${String(failed)} failed, ${((Date.now() - started) / 1000).toFixed(1)} s\n${timings.join('\n')}\n`,
  );
  return failed === 0 ? 0 : 1;
}

try {
  process.exitCode = main();
} catch (error) {
  process.stderr.write(`impact: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
