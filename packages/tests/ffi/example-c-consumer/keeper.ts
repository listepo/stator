/* Task 7.4 Check: the second library in one program (plan.md §10). It keeps every string it
 * makes in module state, so a root its private runtime lost across a collection shows up as a
 * wrong count in `check`, not as a pass. */

const kept: string[] = [];

export function grow(n: number): number {
  for (let i = 0; i < n; i++) {
    kept.push('k' + String(kept.length));
  }
  return kept.length;
}

export function check(): number {
  let total = 0;
  for (let i = 0; i < kept.length; i++) {
    if (kept[i] === 'k' + String(i)) {
      total = total + 1;
    }
  }
  return total;
}
