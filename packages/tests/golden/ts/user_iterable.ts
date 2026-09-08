// User-iterable for-of (Phase 5 step 8): a class whose `[Symbol.iterator]()` returns a generator.
// The method is compile-time-known; Symbol.iterator as a stored value stays STA1212.

function* count(n: number): Generator<number, void, undefined> {
  let i = 0;
  while (i < n) {
    yield i;
    i = i + 1;
  }
}

class Counter {
  n: number;
  constructor(n: number) {
    this.n = n;
  }
  [Symbol.iterator](): Generator<number, void, undefined> {
    return count(this.n);
  }
}

for (const x of new Counter(3)) {
  console.log(x);
}

const c = new Counter(2);
for (const x of c) {
  console.log(x);
}
