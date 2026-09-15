// plan.md §8 step 2a(c) (2488): the explicit `c[Symbol.iterator]` spelling dispatches
// statically on a known user-iterable class — the read is the method's value, the call its
// invocation — while an unknown receiver keeps the precise GetIterator refusal. `for-of` over
// either the instance or the explicitly fetched iterator drives (and closes) the same generator.
// Untyped spelling of symbol_iterator_dispatch.ts.
function* count(n) {
  let i = 0;
  try {
    while (i < n) {
      yield i;
      i = i + 1;
    }
  } finally {
    console.log("closed");
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

const c = new Counter(3);
console.log(typeof c[Symbol.iterator]);
console.log(c[Symbol.iterator] === c[Symbol.iterator]);

const it = c[Symbol.iterator]();
console.log(it.next());

for (const x of c[Symbol.iterator]()) {
  console.log(x);
  if (x === 1) {
    break;
  }
}
console.log("after break");

for (const x of c) {
  console.log(x);
}

for (const x of new Counter(2)) {
  console.log(x);
}
