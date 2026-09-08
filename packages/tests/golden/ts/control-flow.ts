// Loops, jumps and switch, checked against Node byte-for-byte.
//
// The traps here are all about WHERE a jump lands, not whether it happens. Each one produces a
// plausible-looking program that computes the wrong answer — or does not terminate.

// `continue` in a `for` must still run the update. A lowering that jumps to the top of the loop
// instead of to the update spins forever on i === 3.
let sum: number = 0;
for (let i: number = 0; i < 10; i++) {
  if (i === 3) continue;
  if (i === 7) break;
  sum += i;
}
console.log(sum);

// `for (;;)` has no test at all — an absent condition is an infinite loop, not a false one.
let n: number = 0;
for (;;) {
  n++;
  if (n === 4) break;
}
console.log(n);

// `continue` in a do/while jumps to the TEST, so the loop still decides whether to run again.
let d: number = 0;
let guard: number = 0;
do {
  guard++;
  if (guard < 3) continue;
  d = guard;
} while (guard < 5);
console.log(d);
console.log(guard);

// Labelled break leaves the OUTER loop from inside the inner one.
let pairs: number = 0;
outer: for (let a: number = 0; a < 3; a++) {
  for (let b: number = 0; b < 3; b++) {
    if (b === 2) continue outer;
    if (a === 2) break outer;
    pairs++;
  }
}
console.log(pairs);

// Switch: `default` is tried LAST however it is written. Written in the middle here, so a
// lowering that simply falls into the first clause whose test has not yet matched picks it wrongly.
let named: string = "";
const two: number = 2;
switch (two) {
  case 1:
    named = "one";
    break;
  default:
    named = "other";
    break;
  case 2:
    named = "two";
    break;
}
console.log(named);

// The same switch with a value no case matches, to prove `default` is reachable from the middle.
let fallback: string = "";
const seven: number = 7;
switch (seven) {
  case 1:
    fallback = "one";
    break;
  default:
    fallback = "other";
    break;
  case 2:
    fallback = "two";
    break;
}
console.log(fallback);

// Empty clauses stack onto the one below them, so 0 and 1 share a body. This is the only
// fall-through Stator admits: `noFallthroughCasesInSwitch` is on (src/frontend/program.ts), so a
// NON-empty clause without a `break` is rejected by the frontend as STA0012 even though the
// emitter lays clauses out to fall through naturally.
let fell: string = "";
const which: number = 1;
switch (which) {
  case 0:
  case 1:
    fell += "a";
    break;
  case 2:
    fell += "b";
    break;
}
console.log(fell);

// Clause tests use STRICT equality, so a string case never matches a number.
let matched: string = "no";
const one: number = 1;
switch (one) {
  case 1:
    matched = "number";
    break;
}
console.log(matched);

// A switch with no default and no match runs nothing at all.
let untouched: string = "start";
const missing: number = 99;
switch (missing) {
  case 1:
    untouched = "changed";
    break;
}
console.log(untouched);

// `break` inside a switch inside a loop leaves the SWITCH, not the loop — the loop keeps going.
// `continue` inside the same switch leaves the loop iteration, skipping the rest of the switch.
let visited: string = "";
for (let k: number = 0; k < 4; k++) {
  switch (k) {
    case 1:
      visited += "B";
      break;
    case 2:
      continue;
    default:
      visited += "d";
  }
  visited += ".";
}
console.log(visited);

// Compound assignment is the `+` OPERATOR, so it concatenates when the target is a string.
let text: string = "5";
text += 1;
console.log(text);

let count: number = 5;
count += 1;
count -= 2;
count *= 3;
count /= 2;
count %= 4;
console.log(count);

// Prefix and postfix are the same statement when the value is discarded.
let p: number = 0;
p++;
++p;
p--;
console.log(p);
