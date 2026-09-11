// plan.md §8 step 12(e): a function declaration inside a block, a loop or a branch.
//
// A module is ALWAYS strict, so these are block-scoped (ES2015) and Annex B's var-scoped alias
// does not exist. Measured against the pinned Node as an ES module -- the same source run as
// CommonJS answers differently, which is the sloppy-mode semantics Stator never has.
//
// SHADOWING is deliberately absent: a block declaration that reuses an enclosing name still
// collides on one slot, and that is a defect of block scoping itself, not of this construct --
// `{ const x = 2; }` under an outer `const x = 1` miscompiles the same way. plan-notes 209.

const flag = true;
if (flag) {
  // Hoisted to the top of THIS block: callable above its own declaration, and only in here.
  console.log(inner(3));
  function inner(n: number): number {
    return n * 2;
  }
  console.log(inner(4));
}

// One binding per iteration, captured: `step` closes over the iteration's own `i`.
const steps: (() => number)[] = [];
for (let i = 0; i < 3; i++) {
  function step(): number {
    return i * 10;
  }
  steps.push(step);
  console.log(step());
}
console.log(steps.map((f) => f()).join(','));

// A branch that is not taken declares nothing observable.
if (!flag) {
  function unreachable(): string {
    return 'no';
  }
  console.log(unreachable());
}

// Mutual recursion inside one block, which is what hoisting the whole block at once buys.
{
  function even(n: number): boolean {
    return n === 0 ? true : odd(n - 1);
  }
  function odd(n: number): boolean {
    return n === 0 ? false : even(n - 1);
  }
  console.log(even(10));
  console.log(odd(10));
}

// A switch clause list is one block scope: `describe` is reachable from every clause, including
// the one the dispatch jumps to without ever running the clause that declares it.
function classify(n: number): string {
  switch (n) {
    case 0:
      return describe('zero');
    default:
      function describe(word: string): string {
        return `<${word}>`;
      }
      return describe('other');
  }
}
console.log(classify(0));
console.log(classify(1));

// A while body, which is a block like any other.
let ticks = 0;
while (ticks < 2) {
  function tick(): number {
    return ticks;
  }
  console.log(tick());
  ticks++;
}
