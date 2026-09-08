// @mode: ts
// @verdict: static
// @expected-fail: true
// SUBSET.md: Optional chaining ?.

const obj: { x?: number } | null = { x: 42 };
const v: number | undefined = obj?.x;
export { v };
