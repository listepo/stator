/* Task 7.2 step 9: the CI example unit (plan.md §10) — a minimal TS unit exposed to C
 * through `--emit-header`. Three exports: `add` (success path), `boom` (throws, exercising
 * the `stator_consumer_last_error` companion + zero-value sentinel), and `isPositive`
 * (the boolean edge of the ABI table). No top-level side effects, so everything the
 * consumer prints comes from its own `main.c`.
 */

export function add(a: number, b: number): number {
  return a + b;
}

export function boom(x: number): number {
  if (x < 0) {
    throw new Error('neg');
  }
  return x;
}

export function isPositive(x: number): boolean {
  return x > 0;
}
