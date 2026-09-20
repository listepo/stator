// libm through the extern surface from untyped code (docs/FFI.md section 5): the same
// contract as the ts half, plus one dynamically-typed argument — the boundary check at the
// call (STA2001 on mismatch) with the value flowing through when it matches.
/// <reference path="./libm.d.ts" />

function identity(v) {
  return v;
}
console.log(sqrt(2));
console.log(sqrt(identity(9)));
console.log(fmod2(5.5, 2));
console.log(fmod2(-5.5, 2));
console.log(fmod2(5, 0));
console.log(numOf("3.5"));
console.log(numOf("-12.5"));
console.log(getEnv("TZ"));
console.log(fmodChecked(4, 2));
try {
  fmodChecked(5.5, 2);
  console.log("fmodChecked(5.5, 2): no throw");
} catch (e) {
  console.log("caught: " + e.message);
}
console.log(logChecked(1));
try {
  logChecked(0);
  console.log("logChecked(0): no throw");
} catch (e) {
  console.log("caught: " + e.message);
}
console.log(getEnvChecked("TZ"));
try {
  getEnvChecked("STATOR_DEFINITELY_UNSET_VAR");
  console.log("getEnvChecked-unset: no throw");
} catch (e) {
  console.log("caught: " + e.message);
}
console.log(sqrtErrno(4));
// An optional call to an extern is a direct call (Phase 7 close-out): the callee always
// links, so `?.` is a proven no-op — same lines, same bytes as the plain form above.
console.log(sqrt?.(2));
console.log(fmod2?.(5.5, 2));
