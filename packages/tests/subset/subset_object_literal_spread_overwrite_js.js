// @mode: js
// @verdict: static
// SUBSET.md: Object literals with static keys
// A spread overwriting an explicit key (`{ b: 9, ...o }` where `o` has `b`) is legal
// JavaScript — last wins — so js mode never rejects it (§1.2): tsc's TS2783 is a js-mode
// runtime code. The reverse order (`{ ...o, a: 7 }`) never errored: only the OVERWRITTEN
// usage is diagnosed, never the winner. The lowering expands the spread into one read per
// field stored in source order, so the spread's write wins on its own, exactly as Node
// answers it. ts mode keeps the refusal (subset_object_literal_spread_overwrite_ts).

/** @param {{a: number, b: number}} o */
export function f(o) {
  return { b: 9, ...o, a: 7 };
}

console.log(JSON.stringify(f({ a: 1, b: 2 })));
