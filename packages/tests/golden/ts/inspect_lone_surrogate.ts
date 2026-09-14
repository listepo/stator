// A lone surrogate inside a quoted string is escaped, not substituted
// (plan.md §8 step 30 A9): Node prints `[ '\ud800A' ]` where the unquoted path
// prints U+FFFD. A paired surrogate still prints as its character, and a lone
// surrogate in a key escapes the same way.

console.log(['\ud800A']);
console.log(['\udc00']);
console.log(['a\ud800b']);
console.log(['a\udc00b']);
console.log(['\ud800\udc00']);
console.log(['\ud83d\ude00']);
console.log({ '\ud800': 1 });
console.log({ a: '\ud800' });
