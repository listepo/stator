// @mode: js
// @verdict: static
// plan.md §8 step 36: an object-literal method may capture a local; the closure binds at
// construction, so the verdict stays static.

export function counter() {
  let n = 0;
  return {
    get() {
      return n;
    },
  };
}
