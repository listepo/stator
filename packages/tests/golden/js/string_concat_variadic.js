// String concat with any count in js mode (plan.md §8 step 19): arguments evaluate once
// each in source order through the nested singles.

console.log("a".concat("b", "c"));
console.log("a".concat());
console.log("a".concat("b"));
console.log("".concat("x", "y", "z"));
function tag(t) {
  console.log("arg " + t);
  return t;
}
console.log("s".concat(tag("a"), tag("b")));
