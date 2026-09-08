const nested: number[][] = [[1, 2], [3], [], [4, 5]];
console.log(nested.flat());
const deep: number[][][] = [[[1]], [[2, 3]], [[]]];
console.log(deep.flat());
console.log(deep.flat(2));
const xs: number[] = [1, 2, 3, 4];
console.log(xs.flatMap((x) => [x, x * 10]));
console.log(
  xs.flatMap((x): number[] => {
    if (x % 2 === 0) {
      return [x];
    }
    return [];
  }),
);
const ys: number[] = [10, 20, 30, 40, 50];
console.log(ys.splice(1, 2));
console.log(ys);
console.log(ys.splice(-2, 1));
console.log(ys);
console.log(ys.splice(0, 0));
console.log(ys);
console.log(ys.splice(1, 99));
console.log(ys);
const cw: number[] = [1, 2, 3, 4, 5];
console.log(cw.copyWithin(0, 3));
const cw2: number[] = [1, 2, 3, 4, 5];
console.log(cw2.copyWithin(1, 3, 4));
const cw3: number[] = [1, 2, 3, 4, 5];
console.log(cw3.copyWithin(-2, 0));
