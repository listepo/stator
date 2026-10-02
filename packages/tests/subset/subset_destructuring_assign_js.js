// @mode: js
// @verdict: static
// SUBSET.md: Destructuring assignment

// A statement whose targets are variables: the right side runs once, then each target is
// assigned what the declaration form would bind.
let a = 0;
let b = 0;
let label = '';
({ a, b: label } = { a: 1, b: 'one' });
export const sum = a + b + label.length;
