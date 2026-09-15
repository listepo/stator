// @mode: ts
// @verdict: dynamic
// SUBSET.md: function calls
// Overload signatures declare nothing to emit: the implementation below runs, no matter
// which signature a caller resolves through (plan.md §8 step 2a(b)). The union-typed
// implementation lowers to the dynamic representation, so the file is `dynamic`, not
// `static`. A call matching NO overload stays an error here (STA0012); js mode runs it.

function f(a: number): number;
function f(a: string): string;
function f(a: unknown): unknown {
  return a;
}

export const x = [f(1), f("hi")];
