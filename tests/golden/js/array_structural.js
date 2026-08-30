// flat/flatMap/splice/copyWithin in js mode.

const nested = [[1, 2], [3], [], [4, 5]];
console.log(nested.flat());
const xs = [1, 2, 3, 4];
console.log(xs.flatMap((x) => [x, x * 10]));
const ys = [10, 20, 30, 40, 50];
console.log(ys.splice(1, 2));
console.log(ys);
const cw = [1, 2, 3, 4, 5];
console.log(cw.copyWithin(0, 3));
