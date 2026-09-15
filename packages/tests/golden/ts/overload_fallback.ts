// plan.md §8 step 2a(b): top-level overload signatures declare nothing to emit — the
// implementation runs, no matter which signature a caller resolves through. ts mode keeps
// the refusal for a call matching no overload (STA0012); js mode dispatches dynamically.
// (The fallback side lives in tests/golden/js/overload_fallback.js; this file holds what
// ts mode still compiles: match calls, plus an implementation that throws.)

function f(a: number): number;
function f(a: string): string;
function f(a: unknown): unknown {
  return a;
}

console.log(f(1));
console.log(f("hi"));

function g(a: number): number;
function g(a: string): string;
function g(a: unknown): unknown {
  throw new Error("nope");
}

try {
  g("x");
} catch (caught) {
  console.log(caught instanceof Error);
}
