// @mode: js
// @verdict: not-yet
// @code: STA1214
// SUBSET.md: Generics — a specialization is a module-level function, so a named generic
// whose body reads an enclosing scope has no binding to read there and stays refused.
// A capture-free named generic compiles today. (A `.ts`-syntax fixture: `.js` cannot
// spell a type parameter, so the inline/named generic refusal shapes live in `ts`.)

function outer(y: number): void {
  function id<T>(x: T): T {
    console.log(y);
    return x;
  }
  console.log(id(5));
}
outer(1);
export {};
