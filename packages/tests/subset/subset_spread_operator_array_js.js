// @mode: js
// @verdict: dynamic
// SUBSET.md: Spread operator ... in array literals

// Heterogeneous literals infer a union element type -> Unknown in HType, so spread routes dynamic.
const arr1 = [1, 'a'];
const arr2 = [true, 2];
const combined = [...arr1, ...arr2];
export { combined };
