// The local-time half of Date (plan §7 Task 4.2, slice B), proved here rather than in a golden
// fixture. The golden runner pins `TZ=UTC` on BOTH sides deliberately: the compiled binary reads
// the tzdb through libc `localtime_r` while the Node ground truth reads it through ICU, and for
// any real zone a tzdata skew between the two would surface as a byte diff that looks exactly like
// a semantics bug and is not. Under UTC they cannot disagree -- which leaves every DST question
// with nowhere to be asked except here, against dates whose rules have been settled for decades.
//
// Europe/Berlin is the zone throughout: CET (+01:00) and CEST (+02:00), switching on the last
// Sunday of March and October since 1996. Asia/Kolkata is the no-DST half-hour control.

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { compileAndRunLines, NATIVE_ONLY } from './helpers.ts';

const BERLIN = 'Europe/Berlin';

describe('Date local time', NATIVE_ONLY, () => {
  it('reads the host zone offset, in minutes WEST of UTC', () => {
    const lines = compileAndRunLines(
      `console.log(new Date(Date.UTC(2024, 0, 15)).getTimezoneOffset());
       console.log(new Date(Date.UTC(2024, 6, 15)).getTimezoneOffset());
       console.log(new Date(NaN).getTimezoneOffset());`,
      'date-offset',
      BERLIN,
    );
    // The sign is inverted relative to the offset: Berlin is UTC+1 in winter, so -60.
    assert.deepEqual(lines, ['-60', '-120', 'NaN']);
  });

  it('shifts the local getters by that offset', () => {
    const lines = compileAndRunLines(
      `const winter = new Date(Date.UTC(2024, 0, 15, 23, 30));
       console.log(winter.getUTCHours());
       console.log(winter.getHours());
       console.log(winter.getUTCDate());
       console.log(winter.getDate());
       const summer = new Date(Date.UTC(2024, 6, 15, 23, 30));
       console.log(summer.getHours());
       console.log(summer.getDate());`,
      'date-getters',
      BERLIN,
    );
    // 23:30Z on the 15th is 00:30 on the 16th locally -- and 01:30 in summer, which is the whole
    // point of asking twice: one offset would not distinguish the two.
    assert.deepEqual(lines, ['23', '0', '15', '16', '1', '16']);
  });

  it('reads a skipped wall-clock time with the offset from before the transition', () => {
    // 2024-03-31: 02:00 CET becomes 03:00 CEST, so 02:30 local never happens. §21.4.1.26 resolves
    // it with the PRE-transition offset (+01:00), which lands on 01:30Z -- 03:30 local.
    const lines = compileAndRunLines(
      `const gap = new Date(2024, 2, 31, 2, 30);
       console.log(gap.toISOString());
       console.log(gap.getHours());
       console.log(gap.getMinutes());`,
      'date-gap',
      BERLIN,
    );
    assert.deepEqual(lines, ['2024-03-31T01:30:00.000Z', '3', '30']);
  });

  it('reads a repeated wall-clock time as the EARLIER of the two instants', () => {
    // 2024-10-27: 03:00 CEST becomes 02:00 CET, so 02:30 local happens twice -- at 00:30Z under
    // CEST and again at 01:30Z under CET. §21.4.1.26 takes the first, which is the pre-transition
    // offset again. This is the case a naive single-probe conversion gets wrong.
    const lines = compileAndRunLines(
      `const fold = new Date(2024, 9, 27, 2, 30);
       console.log(fold.toISOString());
       console.log(fold.getTimezoneOffset());`,
      'date-fold',
      BERLIN,
    );
    assert.deepEqual(lines, ['2024-10-27T00:30:00.000Z', '-120']);
  });

  it('keeps the wall clock across a transition a setter crosses', () => {
    // Noon in January stays noon in July: the setter rebuilds a LOCAL reading, so the instant moves
    // by an hour more than the calendar change alone would account for.
    const lines = compileAndRunLines(
      `const d = new Date(2024, 0, 15, 12, 0, 0, 0);
       console.log(d.toISOString());
       d.setMonth(6);
       console.log(d.toISOString());
       console.log(d.getHours());
       console.log(d.getTimezoneOffset());`,
      'date-cross',
      BERLIN,
    );
    assert.deepEqual(lines, ['2024-01-15T11:00:00.000Z', '2024-07-15T10:00:00.000Z', '12', '-120']);
  });

  it('rolls out-of-range components and applies the two-digit-year rule locally', () => {
    const lines = compileAndRunLines(
      `console.log(new Date(2024, 13, 40, 25, 70, 70, 1500).toISOString());
       console.log(new Date(2024, -1, 0).toISOString());
       console.log(new Date(99, 5, 1).toISOString());
       console.log(new Date(2024, 5).toISOString());`,
      'date-roll',
      BERLIN,
    );
    // 1999, not year 99: §21.4.2.1's two-digit rule is the constructor's, not the parser's.
    assert.deepEqual(lines, [
      '2025-03-13T01:11:11.500Z',
      '2023-11-29T23:00:00.000Z',
      '1999-05-31T22:00:00.000Z',
      '2024-05-31T22:00:00.000Z',
    ]);
  });

  it('recovers an Invalid Date on the year setter only', () => {
    const lines = compileAndRunLines(
      `const bad = new Date(NaN);
       console.log(bad.setMinutes(30));
       console.log(bad.getFullYear());
       bad.setFullYear(2024, 1, 29);
       console.log(bad.toISOString());`,
      'date-recover',
      BERLIN,
    );
    // §21.4.4.21 substitutes +0 for the LOCAL time value, not for the instant -- so the fields
    // that were not given are midnight LOCAL, and the recovered date is 23:00Z the day before.
    assert.deepEqual(lines, ['NaN', 'NaN', '2024-02-28T23:00:00.000Z']);
  });

  it('handles a half-hour zone with no DST at all', () => {
    const lines = compileAndRunLines(
      `const d = new Date(2024, 0, 15, 12, 45);
       console.log(d.toISOString());
       console.log(d.getTimezoneOffset());
       console.log(d.getHours());
       console.log(d.getMinutes());`,
      'date-halfhour',
      'Asia/Kolkata',
    );
    assert.deepEqual(lines, ['2024-01-15T07:15:00.000Z', '-330', '12', '45']);
  });
});
