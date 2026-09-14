// libm through the extern surface (docs/FFI.md, plan.md section 10 Task 7.1 steps 4–5):
// direct C calls, unboxed both ways, against the pinned Node byte-for-byte. The C-symbol
// override (fmod2→fmod), the CString borrow (numOf) and copy-out (getEnv), and all four
// `@statorError` conventions — nonzero, negative and null on both their paths, errno on its
// success path (no portable libc double→double call sets errno on failure; the failure
// sequence is proved white-box in tests/unit/extern.test.ts).
/// <reference path="./libm.d.ts" />

console.log(sqrt(2));
console.log(sqrt(0));
console.log(fmod2(5.5, 2));
console.log(fmod2(-5.5, 2));
console.log(fmod2(5, 0));
console.log(numOf("3.5" as CString));
console.log(numOf("-12.5" as CString));
console.log(getEnv("TZ" as CString));
console.log(fmodChecked(4, 2));
try {
  fmodChecked(5.5, 2);
  console.log("fmodChecked(5.5, 2): no throw");
} catch (e) {
  if (e instanceof Error) {
    console.log("caught: " + e.message);
  }
}
console.log(logChecked(1));
try {
  logChecked(0);
  console.log("logChecked(0): no throw");
} catch (e) {
  if (e instanceof Error) {
    console.log("caught: " + e.message);
  }
}
console.log(getEnvChecked("TZ" as CString));
try {
  getEnvChecked("STATOR_DEFINITELY_UNSET_VAR" as CString);
  console.log("getEnvChecked-unset: no throw");
} catch (e) {
  if (e instanceof Error) {
    console.log("caught: " + e.message);
  }
}
console.log(sqrtErrno(4));
export {};
