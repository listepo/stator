// plan.md §8 step 36: an object-literal method capturing a local binds at construction.
// Two instances isolate: each counter() call closes over its own n.

function counter() {
  let n = 0;
  return {
    get(): number {
      return n;
    },
    inc(): number {
      n += 1;
      return n;
    },
  };
}

const a = counter();
const b = counter();
console.log(a.get());
console.log(a.inc());
console.log(b.inc());
console.log(a.inc());
console.log(b.get());
