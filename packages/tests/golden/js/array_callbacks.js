// The callback methods in js mode: the lib signature types the arrow parameters contextually,
// so an unannotated callback is still fully typed.

const xs = [3, 1, 4, 1, 5, 9, 2, 6];
xs.forEach((x, i) => {
  console.log(`${i}:${x}`);
});
console.log(xs.map((x) => x * x));
console.log(xs.filter((x) => x % 2 === 0));
console.log(xs.some((x) => x > 8));
console.log(xs.every((x) => x > 0));
console.log(xs.find((x) => x > 4));
console.log(xs.findIndex((x) => x === 5));

const threshold = 3;
console.log(xs.filter((x) => x > threshold));

const words = ['ab', 'c', 'def'];
console.log(words.map((w) => w.length));

console.log(xs.reduce((a, x) => a + x, 0));
console.log(xs.reduceRight((a, x) => `${a},${x}`, 's'));

const sortable = [10, 9, 2, 100, 1];
console.log(sortable.sort());
console.log(sortable.sort((a, b) => a - b));

// A throwing callback stops the walk and the throw reaches the catch -- the untyped path takes the
// same runtime guards, since `jsrt_pending()` is a property of the call, not of the annotation.
const three = [1, 2, 3];
try {
  three.forEach((x) => {
    console.log(x);
    if (x === 2) {
      throw 'stop';
    }
  });
} catch (e) {
  console.log(typeof e);
}
console.log('after forEach');

let asked = 0;
try {
  three.some((x) => {
    asked = asked + 1;
    throw x;
  });
} catch (e) {
  console.log(asked);
  console.log(typeof e);
}

try {
  three.sort(() => {
    throw 'cmp';
  });
} catch (e) {
  console.log(typeof e);
}

// filter captures the value before invoking the predicate; a mutation of the receiver must not
// change the value copied into the result.
const mutated = [1];
console.log(
  mutated.filter((value) => {
    mutated[0] = 2;
    return value === 1;
  }),
);
console.log(mutated);
