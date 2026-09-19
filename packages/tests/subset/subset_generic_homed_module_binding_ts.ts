// @mode: ts
// @verdict: not-yet
// @code: STA1214
// SUBSET.md: Generics — a homed arrow specializes at module level too, so a body reading
// a same-file `let` has no binding to read there and stays refused, like its named twin.

let base = 100;
const id = <T,>(x: T): T => {
  console.log(base);
  return x;
};
console.log(id(5));
