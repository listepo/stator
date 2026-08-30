// RegExp literals and `test`, against the vendored engine (quickjs-ng's libregexp, Task 4.3).
// Everything here is answered by the engine rather than by any code in this compiler, so the
// point of the fixture is the BRIDGE: how a pattern crosses into it, how a subject crosses in
// without a copy, and what `lastIndex` does across calls.

const plain = /abc/;
console.log(plain);
console.log(plain.test('xxabcyy'));
console.log(plain.test('xxabyy'));

// Flags, in the order the source writes them -- the `flags` string is carried verbatim.
const ci = /HeLLo/i;
console.log(ci);
console.log(ci.test('say hello there'));
console.log(ci.test('say HELLO there'));

// Anchors, classes, quantifiers, alternation, groups -- the engine's own business.
console.log(/^\d{3}-\d{4}$/.test('555-1234'));
console.log(/^\d{3}-\d{4}$/.test('5555-1234'));
console.log(/[a-z]+@[a-z]+\.(com|org)/.test('me@example.org'));
console.log(/[a-z]+@[a-z]+\.(com|org)/.test('me@example.net'));
console.log(/colou?r/.test('color'));
console.log(/(\w)\1/.test('letter'));
console.log(/(\w)\1/.test('abcdef'));

// `.` does not cross a newline without /s.
console.log(/a.b/.test('a\nb'));
console.log(/a.b/s.test('a\nb'));

// /m makes ^ and $ match at line boundaries.
console.log(/^two$/.test('one\ntwo\nthree'));
console.log(/^two$/m.test('one\ntwo\nthree'));

// A /g regexp carries `lastIndex` ACROSS calls -- which is why a literal cannot be hoisted out
// of a loop: each evaluation must be a fresh object (§22.2.4.1).
const g = /a/g;
console.log(g.test('banana'));
console.log(g.test('banana'));
console.log(g.test('banana'));
console.log(g.test('banana'));
console.log(g.test('banana'));

// The same literal text, evaluated once per iteration: every iteration starts at zero.
for (let i = 0; i < 3; i++) {
  console.log(/a/g.test('banana'));
}

// /y anchors the attempt AT lastIndex rather than searching from it.
const sticky = /ab/y;
console.log(sticky.test('abab'));
console.log(sticky.test('abab'));
console.log(sticky.test('abab'));

// Unicode: /u pairs surrogates, so a quantifier applies to the whole code point.
console.log(/^.$/u.test('\u{1F600}'));
console.log(/^.$/.test('\u{1F600}'));
console.log(/\u{1F600}/u.test('hi \u{1F600}'));

// A subject with no match at all, and an empty subject.
console.log(/x/.test(''));
console.log(/^$/.test(''));

// The pattern is data to everything above C: a slash inside a character class is not the end.
console.log(/[/]/.test('a/b'));
console.log(/a\/b/.test('a/b'));
