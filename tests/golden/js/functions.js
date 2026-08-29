// js mode: functions whose parameters have no annotation. The values flow through unboxed as
// whatever the caller passed, so one function serves both a number and a string. Arithmetic on
// an unannotated parameter is NOT here — that needs the dynamic representation (Phase 8).
function identity(x) {
  return x;
}

function pick(cond, a, b) {
  if (cond) {
    return a;
  }
  return b;
}

console.log(identity(42));
console.log(identity('text'));
console.log(pick(true, 'yes', 'no'));
console.log(pick(false, 'yes', 'no'));

// A parameter the caller omitted is undefined, not an error.
console.log(identity());
