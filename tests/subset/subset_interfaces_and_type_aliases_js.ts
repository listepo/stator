// @mode: js
// @verdict: static
// @expected-fail: true
// SUBSET.md: Interfaces and type aliases

interface Point { x: number; y: number }
export const p: Point = { x: 1, y: 2 };
