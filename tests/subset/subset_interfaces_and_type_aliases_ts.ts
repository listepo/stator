// @mode: ts
// @verdict: static
// @expected-fail: true
// SUBSET.md: Interfaces and type aliases

type Point = { x: number; y: number };
export const p: Point = { x: 1, y: 2 };
