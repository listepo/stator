// plan.md §8 step 20: an array method on a value the checker typed as an array but that is
// `undefined` at run time (`var` hoisting) throws a catchable TypeError (STA2008), where the
// compiler used to segfault. Uncaught, the same program exits 1 like Node.
function add(v) {
  arr.push(v);
}
try {
  add(1);
  console.log('add(1): no throw');
} catch (e) {
  console.log(e.name);
  console.log(e.message);
  console.log(e instanceof TypeError);
}
var arr = [];

// Once the declaration runs the same call works, and the array reads through every static
// path the lying call skipped: method result, length, and index.
add(2);
console.log(arr.length);
console.log(arr[0]);
try {
  console.log(arr.length);
  console.log('length: no throw');
} catch (e) {
  console.log('length threw: ' + e.message);
}
