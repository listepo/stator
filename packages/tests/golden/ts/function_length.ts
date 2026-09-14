// `fn.length` on a statically-typed function value answers the declared arity (plan.md §8
// step 21b): a direct read of the closure, which never counts a method's receiver
// (docs/VALUE.md §4.16). The ts-mode twin of `function_length.js`.

function arity(fn: (x: number) => number): number {
  return fn.length;
}
function arity2(fn: (a: number, b: number) => number): number {
  return fn.length;
}
const g = (x: number): number => x;
console.log(arity(g));

class C {
  add(a: number, b: number): number {
    return a + b;
  }
  zero(): number {
    return 0;
  }
  withRest(a: number, ...r: number[]): number {
    return a;
  }
  withDefault(a: number, b: number = 2): number {
    return a + b;
  }
}
const o = new C();
const f = o.add;
console.log(arity2(f));
console.log(f.length);
console.log(o.zero.length);
console.log(o.withRest.length);
console.log(o.withDefault.length);

function plain(a: number, b: number, c: number): number {
  return 1;
}
console.log(plain.length);
const nop = (): number => 0;
console.log(nop.length);
