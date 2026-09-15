// @mode: ts
// @verdict: static
// SUBSET.md: `c[Symbol.iterator]` on a known user-iterable class dispatches statically —
// the read is the method's value, the call its invocation (plan.md §8 step 2a(c), 2488).

function* ones(): Generator<number, void, undefined> {
  yield 1;
}
class Box {
  [Symbol.iterator](): Generator<number, void, undefined> {
    return ones();
  }
}
const it = new Box()[Symbol.iterator]();
for (const x of it) {
  console.log(x);
}
export { it };
