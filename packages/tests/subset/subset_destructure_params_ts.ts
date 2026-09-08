// @mode: ts
// @verdict: static
// SUBSET.md: Destructuring parameters

export function add({ x, y }: { x: number; y: number }): number {
  return x + y;
}
