// @mode: ts
// @verdict: not-yet
// @code: STA1214
// SUBSET.md: JSON.stringify
// A top-level argument that may be undefined makes the spec answer undefined where the call's
// type promises a string, so the gate refuses it.

export function f(x: number | undefined): string {
  return JSON.stringify(x);
}
