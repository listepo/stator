// @mode: js
// @verdict: dynamic
// SUBSET.md: generator functions and `yield`
// `.return()`/`.throw()` on the generator object (Phase 5 step 8). The untyped yield's
// injected value is Unknown, so the file is dynamic.

function* gen() {
  const a = yield 1;
  return a;
}
const g = gen();
console.log(g.next());
console.log(g.return("stop"));

const t = gen();
try {
  t.throw("x");
} catch (e) {
  console.log("caught");
}
