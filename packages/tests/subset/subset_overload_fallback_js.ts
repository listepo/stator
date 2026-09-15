// @mode: js
// @verdict: dynamic
// SUBSET.md: function calls
// A call matching no overload runs the implementation with the runtime value (plan.md §8
// step 2a(b)): the union-typed implementation lowers to the dynamic representation, so the
// file is `dynamic`. ts mode keeps the refusal (STA0012).

function f(a: number): number;
function f(a: string): string;
function f(a: unknown): unknown {
  return a;
}

export const x = [f(1), f("hi"), f(true)];
