// `String.prototype.concat` runs ToString on its argument (plan-notes 222): `''.concat(42)` is
// "42", not an assertion failure. Its C name IS the internal concatenation primitive, which takes
// two STRINGS -- so the conversion belongs at the call, exactly as it does for a template
// literal's holes. Every non-string argument below aborted before that.
console.log(''.concat(42));
console.log(''.concat(true));
console.log(''.concat(null));
console.log(''.concat(undefined));
console.log(''.concat(1.5));
console.log('x'.concat(-0));
console.log('a'.concat('b'));
const n = 7;
console.log('n='.concat(n));
