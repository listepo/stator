// strstr through the extern surface from untyped code (docs/FFI.md section 5): the same
// contract as the ts half, plus one dynamically-typed argument — the boundary check at the
// call (STA2001 on mismatch) with the value flowing through when it matches.
/// <reference path="./libc.d.ts" />

function identity(v) {
  return v;
}
console.log(strstr2(identity("hello world"), "world"));
console.log(strstr2("hello world", "hello"));
console.log(strstr2("hello world", ""));
console.log(strstrChecked("hello world", "world"));
try {
  strstrChecked("hello world", "xyz");
  console.log("strstrChecked-miss: no throw");
} catch (e) {
  console.log("caught: " + e.message);
}
