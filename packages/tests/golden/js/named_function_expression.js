// Named function expressions: inner name is body-local, supports recursion, and is immutable.
const fact = function fact(n) {
  return n <= 1 ? 1 : n * fact(n - 1);
};
console.log(fact(5));
console.log(typeof fact);

let outerName = "outer";
const f = function inner(n) {
  return n <= 1 ? 1 : n * inner(n - 1);
};
console.log(f(4));
console.log(typeof inner);
