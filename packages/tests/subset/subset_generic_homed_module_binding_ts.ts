// @mode: ts
// @verdict: not-yet
// @code: STA1214
// SUBSET.md: Generics — specialization bodies lower before their file's own statements, so
// a homed generic arrow whose body reads a same-file `let` has no binding to read there
// and stays refused, exactly like a named declaration. A capture-free homed arrow compiles
// today.

let base = 100;
const id = <T,>(x: T): T => {
  console.log(base);
  return x;
};
console.log(id(5));
