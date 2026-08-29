// @mode: ts
// @verdict: static
// @expected-fail: true
// SUBSET.md: Object destructuring

interface Point {
  x: number;
  y: number;
}
const p: Point = { x: 1, y: 2 };
const { x, y } = p;
export { x, y };
