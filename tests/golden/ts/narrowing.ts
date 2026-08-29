// `typeof`, and the runtime checks that make a narrowing true (plan.md §5 Task 3.5).
//
// TypeScript's narrowing is a static CLAIM about a value, not a proof about it. The compiler emits
// a `jsrt_check_*` at each point where an `unknown` becomes concrete, so the claim is settled once
// and everything after it may trust the type completely (golden rule 4). Node has no checks to
// emit and reaches the same answers, which is what this fixture compares.

// typeof over every value the runtime has. Two of these answers are not the ones a tag would give:
// `typeof null` is "object", and a function is "function" though it is an object everywhere else.
console.log(typeof 1);
console.log(typeof "s");
console.log(typeof true);
console.log(typeof undefined);
console.log(typeof null);
console.log(typeof [1, 2]);
console.log(typeof (0 / 0));
console.log(typeof -0);

// typeof is total: it never coerces its operand, and its answer is a string whatever it asked.
const n = 42;
console.log(typeof typeof n);
console.log(typeof n === "number");
console.log(typeof n === "string");

// A guard narrows the unknown, and the narrowed read carries the check.
function describe(x: unknown): string {
  if (typeof x === "string") {
    return `string of length ${x.length}`;
  }
  if (typeof x === "number") {
    return `number ${x + 0}`;
  }
  if (typeof x === "boolean") {
    return `boolean ${x}`;
  }
  return `something else: ${typeof x}`;
}

console.log(describe("hello"));
console.log(describe(7));
console.log(describe(true));
console.log(describe(null));
console.log(describe(undefined));

// An `as` cast is the same boundary written by hand: the program overrules the checker, and the
// check is what makes that safe. Here the claim is true, so the check passes and the value flows.
function twice(x: unknown): number {
  return (x as number) * 2;
}
console.log(twice(21));

// The guard runs before the narrowing, so a value that fails the guard never reaches the check.
function lengthOrZero(x: unknown): number {
  if (typeof x === "string") {
    return x.length;
  }
  return 0;
}
console.log(lengthOrZero("abcd"));
console.log(lengthOrZero(99));

// Narrowing survives a nested scope and a loop.
function count(x: unknown): number {
  let total = 0;
  if (typeof x === "number") {
    for (let i = 0; i < 3; i = i + 1) {
      total = total + x;
    }
  }
  return total;
}
console.log(count(5));
console.log(count("no"));

// A union is `Unknown` to the HType model — it has no union node — so narrowing one lands on
// exactly the same machinery as narrowing an `unknown`, and gets the same check.
function render(v: string | number | boolean): string {
  if (typeof v === "string") {
    return `s:${v}${v.length}`;
  }
  if (typeof v === "number") {
    return `n:${v * 2}`;
  }
  return `b:${v}`;
}
console.log(render("ab"));
console.log(render(3));
console.log(render(false));

// The narrowing is per-use, not per-binding: the same name is checked again in the second branch
// because the claim being made there is a different one.
function widen(v: number | string): string {
  let out = "";
  if (typeof v === "number") {
    out = out + `${v > 0}`;
  }
  if (typeof v === "string") {
    out = out + v;
  }
  return out;
}
console.log(widen(5));
console.log(widen("x"));
