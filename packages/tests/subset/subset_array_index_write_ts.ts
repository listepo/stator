// @mode: ts
// @verdict: static
// SUBSET.md: Arrays: index access

// A write is static where a read is dynamic: storing into an element asks nothing about what was
// there, so no `T | undefined` is produced and nothing needs narrowing.
const arr: number[] = [1, 2, 3];
arr[0] = 10;
console.log(arr.length);
