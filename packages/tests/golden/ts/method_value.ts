// plan.md §8 step 12(e): a method taken as a value keeps JS arity when called bare.

class Box {
  add(a: number, b: number): number {
    return a + b;
  }
}

const o = new Box();
const g = o.add;
console.log(o.add(1, 2));
console.log(g(1, 2));
