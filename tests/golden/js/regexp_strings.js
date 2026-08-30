// The regexp-taking String.prototype methods in js mode (Task 4.3, second slice): `search`, and the regexp
// forms of `split`, `replace` and `replaceAll`. All three of the latter are the SAME op node as
// their string forms -- the runtime dispatches on the pattern's tag, because a regexp pattern is a
// scan and a string one is a substring search.

// search: a position, or -1. It never leaves `lastIndex` behind, even for a /g pattern.
console.log('a1b2c'.search(/\d/));
console.log('a1b2c'.search(/z/));
console.log('hello'.search(/^h/));
console.log('hello'.search(/o$/));
const stateful = /l/g;
console.log('hello'.search(stateful));
console.log('hello'.search(stateful));

// split on a pattern: the segments between matches.
console.log('a1b2c'.split(/\d/));
console.log('one, two ,three'.split(/\s*,\s*/));
console.log('abc'.split(/x/));
console.log(''.split(/x/));
console.log(''.split(/(?:)/));
console.log('abc'.split(/(?:)/));
// Unicode empty matches advance by code point, not by UTF-16 code unit; retrying at the low
// surrogate would otherwise repeat the same match forever.
console.log('😀'.split(/(?:)/u));
console.log('😀'.replace(/(?:)/gu, '-'));

// Capture groups are part of the ANSWER, not just of the match.
console.log('a1b'.split(/(\d)/));
console.log('ab'.split(/(x)?b/));
console.log('2026-08-30'.split(/(-)/));

// A pattern that can match the empty string does not fill the answer with empty strings.
console.log('ab'.split(/b*/));
console.log('abba'.split(/b*/));

// replace: the first match, wherever it is.
console.log('a1b2c'.replace(/\d/, '#'));
console.log('a1b2c'.replace(/z/, '#'));
console.log('hello world'.replace(/o/, '0'));

// replace with /g: every match, and `lastIndex` ends at 0 whatever it was.
console.log('a1b2c'.replace(/\d/g, '#'));
const g = /o/g;
console.log('foo boo'.replace(g, '0'));
console.log('foo boo'.replace(g, '0'));

// replaceAll demands a /g pattern; the string form of the same call is unchanged.
console.log('abcabc'.replaceAll(/b/g, '[]'));
console.log('abcabc'.replaceAll('b', '[]'));

// GetSubstitution over a match with groups: `$$`, `$&`, the two context forms, and `$n`.
console.log('2026-08-30'.replace(/(\d+)-(\d+)-(\d+)/, '$3/$2/$1'));
console.log('abc'.replace(/b/, '[$&]'));
console.log('abc'.replace(/b/, '[$`]'));
console.log("abc".replace(/b/, "[$']"));
console.log('abc'.replace(/b/, '$$'));
// A group number the pattern does not have stays literal -- which is what makes `$1` print.
console.log('abc'.replace(/b/, '<$1>'));
console.log('abc'.replace(/(b)/, '<$1>'));
console.log('abc'.replace(/(b)/, '<$01>'));
// An optional group that did not participate substitutes nothing at all.
console.log('ac'.replace(/a(x)?c/, '[$1]'));

// The empty-match advance: a global replace over a pattern that matches nothing consumes.
console.log('abc'.replace(/(?:)/g, '-'));
console.log('abc'.replace(/x*/g, '-'));

// Flags reach the scan: case folding, multiline anchors, dot-all.
console.log('Hello World'.replace(/o/gi, '0'));
console.log('one\ntwo'.replace(/^/gm, '> '));
console.log('a\nb'.split(/./s));
