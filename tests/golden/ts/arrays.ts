// Arrays: dense storage, index access, for-of, and the print shapes `util.inspect` produces for
// them. The printing half is as much of the contract as the storage half -- grouping, column
// alignment, the 80-column break and the depth cap are all observable through console.log.

const nums: number[] = [1, 2, 3];
console.log(nums);
console.log(nums.length);

// A read is `T | undefined`: in range it is the element, out of range it really is undefined, and
// a negative or fractional index is a property this array does not have.
console.log(nums[0]);
console.log(nums[2]);
console.log(nums[3]);
console.log(nums[-1]);

// Writes: replacing an element, and appending at exactly `length` (the one growth a dense array
// can do without leaving a hole).
nums[1] = 20;
nums[nums.length] = 4;
console.log(nums);
console.log(nums.length);

const empty: number[] = [];
console.log(empty);
console.log(empty.length);

// for-of binds the element type and re-reads the length each step.
let sum: number = 0;
for (const n of nums) {
  sum += n;
}
console.log(sum);

// Labelled for-of, with `continue` targeting the outer loop from inside the inner one.
const rows: number[][] = [
  [1, 2],
  [3, 4],
  [5],
];
console.log(rows);
outer: for (const row of rows) {
  for (const v of row) {
    if (v === 3) {
      continue outer;
    }
    if (v === 5) {
      break outer;
    }
    console.log(v);
  }
}

// A counted loop building an array by appending at the end.
const doubled: number[] = [];
for (let i: number = 0; i < 5; i++) {
  doubled[doubled.length] = i * 2;
}
console.log(doubled);

// Print shapes. Seven entries is where Node starts grouping into aligned columns; numbers are
// right-aligned and everything else left-aligned.
console.log([1, 2, 3, 4, 5, 6]);
console.log([1, 2, 3, 4, 5, 6, 7]);
console.log([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 100, 1000]);
console.log(['a', 'bb', 'ccc', 'dddd', 'e', 'ff', 'g']);

// Strings inside an array are quoted; a bare string argument is not.
console.log(['it', "isn't", 'a\nb']);
console.log('it');

// Nesting, and the depth cap: `util.inspect` stops at depth 2 and prints `[Array]` below it.
const deep: number[][][] = [[[1, 2]]];
console.log(deep);

// Mixed scalars, including the ones with their own spelling.
const scalars: unknown[] = [true, null, undefined, -0, 0 / 0, 1 / 0];
console.log(scalars);
