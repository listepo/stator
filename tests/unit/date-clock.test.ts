/* `Date.now()` and zero-argument `new Date()` — the determinism carve-out's third proof
 * (plan.md §7 Task 4.2, Date step 7).
 *
 * Every other Date member is proved by `tests/golden/{ts,js}/date_builtins.*`: compile, run, diff
 * against the pinned Node byte-for-byte. These two cannot be. Their answer is the wall clock, so
 * "matches Node" is not a property either one HAS — Node's own run would disagree with itself.
 * The dashboard is allowed to stop counting them against coverage only because this file exists.
 *
 * What IS pinned is everything about the reading except its value: it lands in the era the
 * compiler was built in, it is a whole number of milliseconds (§21.4.3.1), it does not run
 * backwards, it moves when real time passes, and `new Date()` is `new Date(Date.now())` — the
 * desugaring the lowering performs, checked here against the constructor it desugars to. A stub
 * returning a frozen constant satisfies the range and integrality checks and fails the ADVANCE
 * check; one reading a monotonic clock instead of the wall clock fails the era check.
 */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { compileAndRunLines } from './helpers.ts';

test('Date.now reads the wall clock: this era, whole milliseconds, never backwards', () => {
  const out = compileAndRunLines(
    `
    console.log(Date.now());
    console.log(Date.now());
    console.log(Date.now());
  `,
    'date',
  );
  assert.equal(out.length, 3);
  const readings = out.map((l) => Number(l));
  for (const ms of readings) {
    // The WALL clock, not a monotonic one: a monotonic clock's origin is unspecified and on this
    // platform is the boot time, which lands decades away from here. The window is deliberately
    // enormous -- it is asking which clock was read, not what time it is.
    assert.ok(ms > 1_700_000_000_000, `${String(ms)} is before 2023 — not the wall clock`);
    assert.ok(ms < 4_000_000_000_000, `${String(ms)} is past 2096 — not the wall clock`);
    assert.ok(Number.isInteger(ms), `${String(ms)} is not a whole number of milliseconds`);
  }
  const [first, second, third] = readings;
  assert.ok(first !== undefined && second !== undefined && third !== undefined);
  assert.ok(second >= first && third >= second, 'the clock ran backwards within one process');
});

test('Date.now advances as real time passes — the check a frozen stub fails', () => {
  // ~15ms of real work between the two readings, measured by a loop rather than a sleep (this
  // subset has no timer). The margin is one millisecond of movement, not the loop's duration:
  // what is being proved is that the reading is not a constant.
  const out = compileAndRunLines(
    `
    const before = Date.now();
    let spin = 0;
    let i = 0;
    while (i < 3000000) {
      spin = spin + i;
      i = i + 1;
    }
    const after = Date.now();
    console.log(after - before > 0);
    console.log(spin > 0);
  `,
    'date',
  );
  assert.deepEqual(out, ['true', 'true']);
});

test('new Date() is new Date(Date.now()) — same clock, same reading, wrapped', () => {
  const out = compileAndRunLines(
    `
    const before = Date.now();
    const d = new Date();
    const after = Date.now();
    console.log(d.getTime() >= before);
    console.log(d.getTime() <= after);
    console.log(d.getUTCFullYear() >= 2023);
    console.log(d.toISOString().length);
  `,
    'date',
  );
  // Bracketed by two readings of the same clock, so the constructor cannot be reading a different
  // one; the year and the ISO length prove the reading went through the calendar rather than
  // landing in the object raw.
  assert.deepEqual(out, ['true', 'true', 'true', '24']);
});
