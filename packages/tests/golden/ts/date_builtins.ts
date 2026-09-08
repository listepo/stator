// `Date` slice A: the TZ-INDEPENDENT core (plan §7, Task 4.2). Everything here answers the same
// value in every time zone, which is what makes it provable against Node without pinning TZ --
// the local-time surface is slice B and is refused by name at the gate until then.
//
// The two members that read a clock -- `Date.now()` and zero-argument `new Date()` -- are NOT
// here by construction: no fixture can pin their output, and they land under Task 4.2's
// determinism carve-out instead.

// The epoch, and the eight UTC getters over it.
const epoch = new Date(0);
console.log(epoch.getTime());
console.log(epoch.valueOf());
console.log(epoch.getUTCFullYear());
console.log(epoch.getUTCMonth());
console.log(epoch.getUTCDate());
console.log(epoch.getUTCDay());
console.log(epoch.getUTCHours());
console.log(epoch.getUTCMinutes());
console.log(epoch.getUTCSeconds());
console.log(epoch.getUTCMilliseconds());
console.log(epoch.toISOString());
console.log(epoch.toUTCString());
console.log(epoch);

// A leap day, which is where a day-count calendar and a naive one part company.
const leap = new Date('2024-02-29T12:34:56.789Z');
console.log(leap.getUTCFullYear());
console.log(leap.getUTCMonth());
console.log(leap.getUTCDate());
console.log(leap.getUTCDay());
console.log(leap.getUTCHours());
console.log(leap.getUTCMilliseconds());
console.log(leap.toISOString());
console.log(leap.toUTCString());

// BEFORE the epoch: the arithmetic is a floor division, not a truncation, so a negative time
// value one millisecond before 1970 is the last millisecond of 1969 and not the first of 1970.
const before = new Date(-1);
console.log(before.toISOString());
console.log(before.getUTCFullYear());
console.log(before.getUTCMonth());
console.log(before.getUTCDate());
console.log(before.getUTCHours());
console.log(before.getUTCMilliseconds());
const wayBefore = new Date(-2208988800000);
console.log(wayBefore.toISOString());
console.log(wayBefore.getUTCDay());

// The century rule: 1900 is NOT a leap year, 2000 IS. Both are the case a %4 test gets wrong.
console.log(new Date('1900-03-01T00:00:00.000Z').getTime());
console.log(new Date('2000-03-01T00:00:00.000Z').getTime());
console.log(new Date(Date.UTC(1900, 1, 29)).toISOString());
console.log(new Date(Date.UTC(2000, 1, 29)).toISOString());

// The edges of the representable range (§21.4.1.1, +/- 8.64e15) and one step past, which
// TimeClip answers with an Invalid Date.
console.log(new Date(8640000000000000).toISOString());
console.log(new Date(-8640000000000000).toISOString());
console.log(new Date(8640000000000001).getTime());

// An Invalid Date: every getter is NaN, `toJSON` is null (§21.4.4.37 -- which is why
// `JSON.stringify` of one is the string "null" and not a throw), and the printed form says so.
const invalid = new Date(NaN);
console.log(invalid.getTime());
console.log(invalid.getUTCFullYear());
console.log(invalid.getUTCMonth());
console.log(invalid.toJSON());
console.log(invalid);
console.log(JSON.stringify(invalid));

// `Date.UTC`: omitted trailing components default (month 0, day 1, the rest 0), out-of-range ones
// ROLL rather than clamp, and a two-digit year means 19xx (§21.4.3.4 step 8).
console.log(Date.UTC(2024, 0, 1));
console.log(Date.UTC(2024, 0));
console.log(Date.UTC(2024, 1, 29, 12, 34, 56, 789));
console.log(Date.UTC(2024, 12, 1));
console.log(Date.UTC(2024, 0, 0));
console.log(Date.UTC(2024, 0, 1, 25));
console.log(Date.UTC(99, 0, 1));
console.log(Date.UTC(0, 0, 1));

// `Date.parse` over the §21.4.1.32 Date Time String Format. A date-only form is UTC; a date-time
// with an explicit offset is that offset; a date-time with NO offset is LOCAL time, which slice A
// cannot resolve and answers NaN for rather than guessing.
console.log(Date.parse('2024-02-29'));
console.log(Date.parse('2024-02'));
console.log(Date.parse('2024'));
console.log(Date.parse('2024-02-29T12:34:56Z'));
console.log(Date.parse('2024-02-29T12:34:56.789Z'));
console.log(Date.parse('2024-02-29T12:34:56+05:30'));
console.log(Date.parse('2024-02-29T12:34:56-08:00'));
console.log(Date.parse('not a date'));

// The setters, each answering the NEW time value. Trailing components may be omitted and keep
// what the date already held; out-of-range values roll, exactly as in `Date.UTC`.
const moving = new Date('2024-02-29T12:34:56.789Z');
console.log(moving.setUTCMilliseconds(1));
console.log(moving.setUTCSeconds(2));
console.log(moving.setUTCMinutes(3));
console.log(moving.setUTCHours(4));
console.log(moving.setUTCDate(5));
console.log(moving.setUTCMonth(6));
console.log(moving.setUTCFullYear(2030));
console.log(moving.toISOString());
console.log(moving.setUTCHours(1, 2, 3, 4));
console.log(moving.toISOString());
console.log(moving.setTime(0));
console.log(moving.toISOString());

// §21.4.4.21: `setUTCFullYear` on an Invalid Date RECOVERS -- the time value is treated as +0 --
// while every other setter leaves it invalid. It is the one asymmetry in the setter family.
const recovered = new Date(NaN);
console.log(recovered.setUTCFullYear(2024));
console.log(recovered.toISOString());
const stillInvalid = new Date(NaN);
console.log(stillInvalid.setUTCMonth(5));
console.log(stillInvalid.getTime());

// A Date nests and serializes like any other value: `JSON.stringify` reaches `toJSON`, and the
// inspected form inside a container is the ISO string without quotes.
const at = new Date('2024-02-29T12:34:56.789Z');
console.log(JSON.stringify({ at: at }));
console.log(JSON.stringify([at, at]));
console.log([at]);
console.log({ at: at });

// The three constructor argument forms.
console.log(new Date(1709210096789).toISOString());
console.log(new Date('2024-02-29T12:34:56.789Z').getTime());
console.log(new Date(at).getTime());
