// `RegExp.prototype`'s DATA properties (§22.2.6) and `toString`. None of them is stored state: the
// runtime derives every one from the compiled regexp, which is why the fixture's job is to prove
// the DERIVATION agrees with Node rather than that a field round-trips.
//
// The one that is not obvious is `flags`. §22.2.6.4 builds the string in the spec's own order --
// `d g i m s u v y` -- NOT the order the program wrote the letters in, and `console.log(re)` shows
// the same normalized form. `/a/ig` therefore prints `/a/gi`.

const plain = /abc/;
console.log(plain.source);
console.log(plain.flags);
console.log(plain.lastIndex);
console.log(plain.global);
console.log(plain.ignoreCase);
console.log(plain.multiline);
console.log(plain.dotAll);
console.log(plain.sticky);
console.log(plain.unicode);
console.log(plain.hasIndices);
console.log(plain.toString());

// Written `ig`, canonically `gi` -- in the property, in `toString`, and in the printed form.
const swapped = /a(b)c/ig;
console.log(swapped.flags);
console.log(swapped.toString());
console.log(swapped);

// Every flag at once, minus `v`, which cannot combine with `u`.
const many = /x/dgimsuy;
console.log(many.flags);
console.log(many.hasIndices);
console.log(many.global);
console.log(many.ignoreCase);
console.log(many.multiline);
console.log(many.dotAll);
console.log(many.unicode);
console.log(many.sticky);

// `lastIndex` is state, and the only property here that MOVES. `test` advances it for a /g pattern
// and leaves it alone for a plain one -- so reading it across calls is what shows the difference.
const walk = /a/g;
console.log(walk.lastIndex);
console.log(walk.test('banana'));
console.log(walk.lastIndex);
console.log(walk.test('banana'));
console.log(walk.lastIndex);
console.log(walk.test('banana'));
console.log(walk.lastIndex);
console.log(walk.test('banana'));
console.log(walk.lastIndex);

const stateless = /a/;
console.log(stateless.test('banana'));
console.log(stateless.lastIndex);

// A source with a slash in it, and one with a character class: `source` is the pattern AS WRITTEN
// between the delimiters, escapes included, so `/source/flags` always parses back.
const slashy = /a\/b/;
console.log(slashy.source);
console.log(slashy.toString());
const classy = /[\d.]+/;
console.log(classy.source);
console.log(classy.toString());

// A property read is an expression like any other: it composes.
console.log(`${plain.source} has ${plain.flags.length} flags`);
console.log(swapped.flags.toUpperCase());
console.log(walk.global && !walk.sticky);
