// Captured variables (rung 4b): the cases where a value has to outlive the frame that declared
// it, where two closures must agree on one variable, and where a chain has to reach past a scope
// that captures nothing itself.

// The basic case, and the one that proves the environment is per-EVALUATION: two counters built
// from the same function expression must not share `n`.
function counter(): () => number {
  let n: number = 0;
  return function (): number {
    n = n + 1;
    return n;
  };
}
const first: () => number = counter();
console.log(first());
console.log(first());
const second: () => number = counter();
console.log(second());
console.log(first());

// One variable, two closures. A write through one is visible through the other, which is what
// storing the variable IN the environment buys over copying it into each closure.
function shared(): () => number {
  let total: number = 100;
  function bump(): void {
    total = total + 5;
  }
  function read(): number {
    bump();
    return total;
  }
  return read;
}
const acc: () => number = shared();
console.log(acc());
console.log(acc());

// A capture reaching two levels out, through a middle function that captures nothing of its own.
// The chain runs over env-bearing scopes only, so `middle` adds no level to it -- but it still has
// to carry the environment through, or the innermost function cannot see `tag`.
function outer(): () => string {
  const tag: string = "deep";
  function middle(): () => string {
    return function (): string {
      return tag;
    };
  }
  return middle();
}
const reach: () => string = outer();
console.log(reach());

// A captured parameter, not just a captured local: parameters live in the environment too when
// something reads them from below.
function adder(base: number): (x: number) => number {
  return function (x: number): number {
    return base + x;
  };
}
const addTen: (x: number) => number = adder(10);
const addOne: (x: number) => number = adder(1);
console.log(addTen(5));
console.log(addOne(5));
console.log(addTen(0));

// Capturing a binding declared INSIDE a loop is held back to the rung that gives loops their own
// per-iteration environments; the gate rejects it, so it lives in tests/subset, not here. A loop
// around a closure over a variable declared outside it is fine, and is the case below: one `count`,
// one slot, incremented from within the loop through the closure.
function drive(): number {
  let count: number = 0;
  const bump = function (): void {
    count = count + 1;
  };
  for (let i: number = 0; i < 4; i++) {
    bump();
  }
  return count;
}
console.log(drive());

// The mutation-after-capture case stated on its own: the closure is built first and the write
// happens afterwards, so a closure holding a copy would print the stale value.
function writeAfterCapture(): number {
  let value: number = 1;
  const read = function (): number {
    return value;
  };
  value = 42;
  return read();
}
console.log(writeAfterCapture());

// The emitter writes function units before main. A captured local in the last emitted function
// must not leak its environment lookup into a same-named module binding emitted afterwards.
const value: string = "module";
console.log(value);
