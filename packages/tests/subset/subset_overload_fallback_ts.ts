// @mode: ts
// @verdict: error
// @code: STA0012
// SUBSET.md: function calls
// ts mode keeps the refusal: a call matching no overload is a type error (TS2769), and the
// implementation never runs (plan.md §8 step 2a(b)). js mode dispatches dynamically.

function f(a: number): number;
function f(a: string): string;
function f(a: unknown): unknown {
  return a;
}

export const x = f(true);
