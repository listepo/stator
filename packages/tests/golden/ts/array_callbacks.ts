const xs: number[] = [3, 1, 4, 1, 5, 9, 2, 6];

xs.forEach((x) => {
  console.log(x * 2);
});
xs.forEach((x, i) => {
  console.log(`${i}:${x}`);
});

console.log(xs.map((x) => x * x));
console.log(xs.map((x) => `n${x}`));
console.log(xs.filter((x) => x % 2 === 0));
console.log(xs.filter((x) => x % 2));
console.log(xs.some((x) => x > 8));
console.log(xs.some((x) => x > 9));
console.log(xs.every((x) => x > 0));
console.log(xs.every((x) => x > 1));
console.log(xs.find((x) => x > 4));
console.log(xs.find((x) => x > 100));
console.log(xs.findIndex((x) => x === 5));
console.log(xs.findIndex((x) => x === 7));

function isBig(x: number): boolean {
  return x >= 5;
}
console.log(xs.filter(isBig));

const threshold = 3;
console.log(xs.filter((x) => x > threshold));

const words: string[] = ['ab', 'c', 'def'];
console.log(words.map((w) => w.length));
console.log(words.map((w, i, all) => `${w}/${all.length - i}`));

const empty: number[] = [];
console.log(empty.map((x) => x + 1));
console.log(empty.some((x) => x > 0));
console.log(empty.every((x) => x > 0));
console.log(empty.find((x) => x > 0));

const nested: number[][] = [[1, 2], [3]];
console.log(nested.map((row) => row.length));
console.log(nested.filter((row) => row.includes(3)));

console.log(xs.reduce((a, x) => a + x, 0));
console.log(xs.reduce((a, x) => `${a},${x}`, 's'));
console.log(xs.reduceRight((a, x) => `${a},${x}`, 's'));
console.log(empty.reduce((a, x) => a + x, 42));

const sortable: number[] = [10, 9, 2, 100, 1];
console.log(sortable.sort());
console.log(sortable.sort((a, b) => a - b));
const names: string[] = ['pear', 'Apple', 'apple', ''];
console.log(names.sort());
const pairs = [
  { k: 2, v: 'a' },
  { k: 1, v: 'b' },
  { k: 2, v: 'c' },
];
pairs.sort((a, b) => a.k - b.k);
console.log(pairs.map((p) => p.v));

// A callback that THROWS stops the walk where it stands and the exception reaches the catch: the
// runtime's loop guards test `jsrt_pending()`, and the emitter follows a callback op with the same
// pending check an ordinary call gets. Without both halves the walk ran to completion and the
// throw was swallowed.
const three: number[] = [1, 2, 3];
try {
  three.forEach((x: number): void => {
    console.log(x);
    if (x === 2) {
      throw 'stop';
    }
  });
} catch (e) {
  console.log(typeof e);
}
console.log('after forEach');

// The same for a value-producing op: nothing may observe the partial answer.
try {
  const doubled: number[] = three.map((x: number): number => {
    if (x === 2) {
      throw 'no';
    }
    return x * 2;
  });
  console.log(doubled);
} catch {
  console.log('map threw');
}

// And for a predicate, where the walk would otherwise keep asking after the throw.
let asked = 0;
try {
  three.filter((x: number): boolean => {
    asked = asked + 1;
    if (x === 1) {
      throw 'first';
    }
    return true;
  });
} catch {
  console.log(asked);
}

// A throwing COMPARATOR stops the sort; the receiver is not observed after it.
try {
  const unsorted: number[] = [3, 1, 2];
  unsorted.sort((): number => {
    throw 'cmp';
  });
} catch {
  console.log('sort threw');
}

// A reduce that throws part way leaves no accumulator behind.
try {
  console.log(
    three.reduce((a: number, x: number): number => {
      if (x === 3) {
        throw 'acc';
      }
      return a + x;
    }, 0),
  );
} catch {
  console.log('reduce threw');
}

// filter captures the value before invoking the predicate; a mutation of the receiver must not
// change the value copied into the result.
const mutated: number[] = [1];
console.log(
  mutated.filter((value: number): boolean => {
    mutated[0] = 2;
    return value === 1;
  }),
);
console.log(mutated);
