// @mode: js
// @verdict: static
// @expected-fail: true
// SUBSET.md: Generics

export function box<T>(item: T): T {
  return item;
}
export const v = box(42);
