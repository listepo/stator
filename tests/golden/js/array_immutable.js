// findLast/findLastIndex/toReversed/toSorted/toSpliced/toString/with in js mode.

const xs = [5, 12, 8, 1, 12];
console.log(xs.findLast((x) => x > 6));
console.log(xs.findLastIndex((x) => x === 12));
console.log(xs.toReversed());
console.log(xs.toSorted((a, b) => a - b));
console.log(xs.toSpliced(1, 2));
console.log(xs.toString());
console.log(xs.with(0, 99));
console.log(xs);
