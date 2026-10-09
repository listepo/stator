// Typed half of the T18 pressure loops (packages/tests/golden/js/gc_rooting.js). `<` and the
// default sort run ToPrimitive / ToString, which allocate; adoption enqueues across an allocation.
// Loose equality of an object and a string is a ts-mode type error (TS 2367), so that loop stays
// in the js fixture.

class Label {
  n: number;
  constructor(n: number) {
    this.n = n;
  }
  valueOf(): object {
    return this;
  }
  toString(): string {
    return String(this.n);
  }
}

let less = 0;
for (let i = 0; i < 20000; i++) {
  if (new Label(i) < new Label(i + 1)) {
    less++;
  }
}
console.log(less);

const nums: number[] = [];
for (let i = 0; i < 500; i++) {
  nums.push((i * 17) % 500);
}
nums.sort();
const first = nums[0];
const last = nums[nums.length - 1];
console.log(first, last, nums.length);

async function adopted(): Promise<void> {
  let sum = 0;
  for (let i = 0; i < 1000; i++) {
    const inner = Promise.resolve(i);
    const outer = new Promise<number>((resolve) => {
      resolve(inner);
    });
    if (i % 250 === 249) {
      sum += await outer;
    }
  }
  console.log(sum);
}
adopted();
