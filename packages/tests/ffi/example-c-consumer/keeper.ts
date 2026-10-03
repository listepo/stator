/* Task 7.4 Check: the second library in one program (plan.md §10). It keeps every string it
 * makes in module state, so a root its private runtime lost across a collection shows up as a
 * wrong count in `check`, not as a pass. `deep` overflows the native stack on purpose: each
 * private runtime sets its own stack limit (plan-notes 338), and the overflow must surface as a
 * RangeError in this library's `last_error` while the other library keeps working. */

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

function down(n: number): number {
  return down(n + 1) + 1;
}

export function deep(): number {
  return down(0);
}
