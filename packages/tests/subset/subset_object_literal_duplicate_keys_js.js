// @mode: js
// @verdict: dynamic
// SUBSET.md: Object literals with static keys
// Duplicate data-property keys are legal JavaScript — last wins — so js mode never rejects them
// (§1.2): tsc's grammar check TS1117 is a js-mode runtime code (plan.md §8 step 26). The untyped
// parameter makes the literal dynamic; the duplicate still resolves last-wins.

export function dup(x) {
  return { x: 1, x: x };
}

console.log(dup(2).x);
