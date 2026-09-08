// @mode: js
// @verdict: static
// The write stays a STATIC slot store: the object literal has a fixed shape and `Object.freeze`
// returns it unchanged, so dropping TS2540 costs no type information at all. What the checker
// refused is settled at run time by a real TypeError object (plan-notes 195), not by boxing.
// SUBSET.md: write through a frozen reference
const frozen = Object.freeze({ a: 1 });
frozen.a = 2;
console.log(frozen.a);
