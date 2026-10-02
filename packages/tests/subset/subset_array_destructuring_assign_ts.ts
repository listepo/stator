// @mode: ts
// @verdict: dynamic
// SUBSET.md: Destructuring assignment

// The array form reads each target by index, as `const [a, b] = rhs` does, which is the dynamic
// path in both forms.
let a = 0;
let b = 0;
[a, b] = [b, a];
[a, , b] = [1, 2, 3];
export const sum = a + b;
