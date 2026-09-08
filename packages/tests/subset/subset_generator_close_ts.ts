// @mode: ts
// @verdict: dynamic
// SUBSET.md: generator functions and `yield`
// `.return()`/`.throw()` on the generator object (Phase 5 step 8). The calls are statically
// typed, but IteratorResult is an interface the HIR does not layout, so the result object is
// Unknown and the file verdict counts it — the same reason no static fixture calls `.next()`.

function* gen(): Generator<number, string, undefined> {
  yield 1;
  return "end";
}
const g = gen();
console.log(g.next());
console.log(g.return("stop"));
console.log(g.next());

const t = gen();
try {
  t.throw("x");
} catch (e) {
  console.log("caught");
}
