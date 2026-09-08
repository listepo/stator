// @mode: ts
// @verdict: static
// SUBSET.md: Object destructuring

const p: { x: number; y: number } = { x: 1, y: 2 };
const { x, y } = p;
export { x, y };
