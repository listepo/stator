// @mode: ts
// @verdict: dynamic
// SUBSET.md: Spread operator ... in array literals
// A narrowed match array spreads element-wise in ts mode too: the lowering is mode-agnostic,
// and the checker never refused this shape. Dynamic through the Unknown operand, like the js
// twin (plan.md §8 step 44a).

const m: RegExpExecArray | null = /a(b)/.exec("ab");
if (m !== null) {
  console.log(JSON.stringify([...m]));
}
