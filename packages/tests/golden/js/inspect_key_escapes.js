// A quoted key escapes exactly the way a quoted string does (plan.md §8 step 30
// A8): control characters print as `\n` / `\x0B` / `\xXX`, never as raw bytes
// that break the layout. Quote choice follows the string rule (single unless the
// key holds one, double unless it holds both kinds).

console.log({ 'a\nb': 1 });
console.log({ 'c\vd': 2 });
console.log({ 'e\x01f': 3 });
console.log({ 'x\x7Fy': 4 });
console.log({ 'a\tb': 5, 'x\ry': 6, 'p\bb': 7, 'q\fb': 8 });
console.log({ 'a"b': 9 });
console.log({ "it's": 10 });
console.log({ 'a\\b': 11 });
console.log({ 'plain': 12, 'with-dash': 13 });
