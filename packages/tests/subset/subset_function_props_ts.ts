// @mode: ts
// @verdict: not-yet
// @code: STA1214
// SUBSET.md: Property of a function value

// TypeScript types a function declaration's expando properties, but ts mode compiles a function
// to a closure with no property layout; the js-mode property table is untyped storage.
function assert(v: boolean): void {
  if (!v) throw new Error('assertion failed');
}
assert.same = (a: number, b: number): boolean => a === b;
console.log(assert.same(1, 1));
