// Spread of a union of arrays: every arm is spreadable, so the union spreads even
// though the element type is only known at run time. Both members and every position
// (first, middle, last) keep iteration order.
function first(u: number[] | string[]): (number | string)[] {
  return [...u];
}
console.log(first([1, 2]));
console.log(first(["a", "b"]));

function middle(u: number[] | string[]): (number | string)[] {
  return [0, ...u, 9];
}
console.log(middle([1, 2]));
console.log(middle(["a", "b"]));

function last(u: number[] | string[]): (number | string)[] {
  return [0, ...u];
}
console.log(last([1, 2]));
console.log(last(["a", "b"]));

function two(u: number[] | string[], v: number[] | string[]): (number | string)[] {
  return [...u, ...v];
}
console.log(two([1], ["a"]));
console.log(two(["a"], [1]));
