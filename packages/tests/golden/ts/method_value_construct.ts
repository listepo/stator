// plan.md §8 step 12(e): extracting a method still evaluates the receiver, so `new C().m` constructs C.

class C {
  constructor() {
    console.log('constructed');
  }
  m(): number {
    return 1;
  }
}

const g = new C().m;
console.log(typeof g);
