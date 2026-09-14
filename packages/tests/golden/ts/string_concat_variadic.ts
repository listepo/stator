// String concat with any count (plan.md §8 step 19): zero arguments answer the receiver,
// one is the single form, and more fold left into nested singles — pure concatenation, with
// arguments evaluated once each in source order.

console.log("a".concat("b", "c"));
console.log("a".concat());
console.log("a".concat("b"));
console.log("".concat("x", "y", "z"));
function tag(t: string): string {
  console.log("arg " + t);
  return t;
}
console.log("s".concat(tag("a"), tag("b")));
