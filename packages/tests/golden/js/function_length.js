// `fn.length` on an untyped function value answers the declared arity (plan.md §8 step 21b).
// The receiver here is `Unknown`, so the read takes the dynamic path through `jsrt_get_prop`;
// a method's closure never counts its receiver, which is what the `add` case pins.

const g = (x) => x;
function arity(fn) {
  return fn.length;
}
console.log(arity(g));

class C {
  add(a, b) {
    return a + b;
  }
  zero() {
    return 0;
  }
  withRest(a, ...r) {
    return a;
  }
}
const o = new C();
const f = o.add;
console.log(arity(f));
console.log(arity(o.zero));
console.log(arity(o.withRest));

function plain(a, b, c) {
  return 1;
}
console.log(arity(plain));
const nop = () => 0;
console.log(arity(nop));

// A statically-typed function in js mode takes the direct closure read instead.
const typed = (x) => x;
console.log(typed.length);
console.log(f.length);
