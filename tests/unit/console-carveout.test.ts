/* console.time / console.timeEnd / console.trace — the determinism carve-out's second proof
 * (plan.md §7 Task 4.2, plan-notes 116/124).
 *
 * Every other builtin is proved by a golden test: compile it, run it, diff stdout against the
 * pinned Node byte-for-byte. These three cannot be proved that way and never will be. A duration
 * measures THIS machine on THIS run, and `trace` prints a stack — frames this runtime has no
 * unwinder to produce. "Matches Node" is not a property either one HAS, which is exactly why the
 * plan carves them out, and this file is the other half of that carve-out: the dashboard is
 * allowed to stop counting them against coverage only because these assertions exist.
 *
 * So this tests what the spec and Node's own format DO pin — the label is echoed, a duration
 * follows it, the unit is `ms` below a second, an unstarted label prints nothing, and `trace`
 * writes its prefix to STDERR — rather than a value. A stub printing `t: 0ms` unconditionally
 * satisfies the shape and fails the ordering check; one printing to stdout fails the stream check.
 */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { compileAndRunStreams } from './helpers.ts';

void test('console.time/timeEnd echo the label with a duration in ms', () => {
  const { stdout } = compileAndRunStreams(
    "console.time('alpha');\nconsole.timeEnd('alpha');\nconsole.time();\nconsole.timeEnd();\n",
    'console',
  );
  const lines = stdout.trimEnd().split('\n');
  assert.equal(lines.length, 2);
  // `console.time` itself prints NOTHING: two timers produce two lines, not four.
  // The label is echoed verbatim, and the omitted label counts under `default` — the literal Node
  // prints, not a placeholder.
  assert.match(lines[0] ?? '', /^alpha: \d+\.\d{3}ms$/);
  assert.match(lines[1] ?? '', /^default: \d+\.\d{3}ms$/);
});

void test('a longer interval measures longer, and a timer that never started prints nothing', () => {
  // Ordering, not magnitude: the wall time a loop takes is not a number a test may assert, but
  // "more work took longer" is a property a stub returning a constant cannot fake.
  const { stdout } = compileAndRunStreams(
    [
      "console.time('quick');",
      "console.timeEnd('quick');",
      "console.time('slow');",
      'let sink = 0;',
      'for (let i = 0; i < 3000000; i++) {',
      '  sink += i;',
      '}',
      "console.timeEnd('slow');",
      'console.log(sink > 0);',
      // Node warns for an unknown label and writes no duration to stdout. Warning is a channel
      // this runtime does not have, so it prints nothing at all — the same observable stdout.
      "console.timeEnd('never-started');",
    ].join('\n'),
    'console',
  );
  const lines = stdout.trimEnd().split('\n');
  assert.deepEqual(
    lines.map((line) => line.split(':')[0]),
    ['quick', 'slow', 'true'],
  );
  const ms = (line: string): number => Number(/: ([\d.]+)ms$/.exec(line)?.[1] ?? Number.NaN);
  const quick = ms(lines[0] ?? '');
  const slow = ms(lines[1] ?? '');
  assert.ok(Number.isFinite(quick) && Number.isFinite(slow), `not durations: ${stdout}`);
  assert.ok(
    slow > quick,
    `three million adds did not measure longer: ${String(slow)} vs ${String(quick)}`,
  );
});

void test('console.trace writes its prefix to stderr, not stdout', () => {
  const { stdout, stderr } = compileAndRunStreams(
    "console.trace('why');\nconsole.trace();\n",
    'console',
  );
  // Node's stream split, which is the half of `trace` that IS reproducible. The frames are not:
  // this runtime has no unwinder and does not fabricate any, so the contract is the prefix.
  assert.equal(stdout, '');
  assert.deepEqual(stderr.trimEnd().split('\n'), ['Trace: why', 'Trace']);
});
