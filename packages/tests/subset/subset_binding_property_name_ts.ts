// @mode: ts
// @verdict: static
// SUBSET.md: Global functions

// The property name in an object binding pattern reads no binding, even when the checker
// resolves it to a lib declaration (`length`, `setTimeout`).
const xs: number[] = [1, 2, 3];
const { length: count } = xs;
const { length: chars } = 'hello';
export const total = count + chars;
