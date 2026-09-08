// `exec` and `match` — the ARRAY WITH PROPERTIES (Task 4.1's remaining blocker, plan.md §7).
//
// A match is a dense array of the capture groups that ALSO carries `index`, `input` and `groups`
// as named properties. That combination is the representation this fixture exists to pin: the
// elements print like an array's, the properties print after them, and `groups` is a
// null-prototype object exactly as ECMA-262 §22.2.7.2 builds it.

const pair = /(\d+)-(\w+)/;
const m = pair.exec('12-ab');
console.log(m);

// The properties, read one at a time. `m` is typed `RegExpExecArray | null`, so the read only
// type-checks inside the null guard — and the compiler's own type for it stays Unknown, because a
// match-or-null is a union the HIR does not model.
if (m !== null) {
  console.log(m[0]);
  console.log(m[1]);
  console.log(m[2]);
  console.log(m.length);
  console.log(m.index);
  console.log(m.input);
  console.log(m.groups);
}

// A group that did not participate is `undefined` IN the array, not a missing element.
const optional = /a(x)?(b)/;
console.log(optional.exec('ab'));

// A pattern that does not match answers null, and the guard is what makes that visible.
console.log(pair.exec('nope'));

// Named groups: `groups` is an object, and its own keys are readable through it.
const dated = /(?<year>\d{4})-(?<month>\d{2})/;
console.log(dated.exec('2026-09'));
const d = dated.exec('2026-09');
if (d !== null) {
  console.log(d.index);
  console.log(d.length);
}

// `lastIndex` is state on the PATTERN, so a /g pattern walks the subject across calls — the same
// cursor `test` moves, because exec and test are one algorithm with two answers.
const walker = /a/g;
console.log(walker.exec('aab'));
console.log(walker.exec('aab'));
console.log(walker.exec('aab'));
console.log(walker.exec('aab'));

// String.prototype.match: without /g it IS exec; with /g it is the plain list of whole matches,
// which carries no properties at all, and `null` when nothing matched.
console.log('12-ab'.match(pair));
console.log('a bc def'.match(/[a-z]+/g));
console.log('a bc def'.match(/z/g));
console.log('a bc def'.match(/z/));

// A sticky pattern must match AT lastIndex, not merely at or after it.
const sticky = /a/y;
console.log(sticky.exec('ba'));
console.log(sticky.exec('ab'));
console.log(sticky.exec('ab'));
