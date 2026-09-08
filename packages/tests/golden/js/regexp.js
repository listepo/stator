// RegExp literals and `test` in js mode. The interesting difference from the ts fixture is the
// UNTYPED subject: a parameter with no annotation reaches `jsrt_regexp_test` as a dynamic value,
// and the tag check inside the bridge is what settles that it really is a string.

function isWord(s) {
  return /^\w+$/.test(s);
}

console.log(isWord('word'));
console.log(isWord('two words'));

// The RECEIVER, by contrast, must be a regexp the checker can see: a method call through an
// untyped value needs the dynamic tier, so a regexp in a parameter is a not-yet, not a hole.
const spaced = /\s/;
console.log(spaced.test('two words'));

// A regexp is a value like any other: it rides in a variable, an array, and a parameter.
const patterns = [/^a/, /b$/, /c/i];
for (const p of patterns) {
  console.log(p);
  console.log(p.test('abC'));
}

// The literal is re-evaluated per call, so the /g state of one call never leaks into the next.
function firstTwo(s) {
  const g = /o/g;
  console.log(g.test(s));
  console.log(g.test(s));
}
firstTwo('foo boo');
firstTwo('foo boo');

// Escapes that only mean something to the engine: it reads the pattern TEXT, so a backslash here
// is a backslash there.
console.log(/\d+\.\d+/.test('pi is 3.14'));
console.log(/\bcat\b/.test('the cat sat'));
console.log(/\bcat\b/.test('concatenate'));
console.log(/[^aeiou]{4}/.test('rhythm'));
console.log(/(?:ab)+/.test('ababab'));
console.log(/(?=foo)/.test('foobar'));
console.log(/(?!foo)bar/.test('bar'));

// A pattern built from characters outside ASCII, both with and without /u.
console.log(/café/.test('café'));
console.log(/^.{5}$/.test('cafés'));
console.log(/[\u{1F600}-\u{1F64F}]/u.test('a \u{1F60A} b'));

// Printing: source and flags, in the order written.
console.log(/x/gimsy);
console.log(/[/]\//);
