// User-iterable for-of (Phase 5 step 8), untyped spelling.
function* count(n) {
  let i = 0;
  while (i < n) {
    yield i;
    i = i + 1;
  }
}

class Counter {
  constructor(n) {
    this.n = n;
  }
  [Symbol.iterator]() {
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
