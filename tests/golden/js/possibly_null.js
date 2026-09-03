// plan.md §8 step 2a(a). Every line here is ordinary JavaScript that runs, and every one of them
// was refused by the checker before the possibly-null family was suppressed in js mode: indexing an
// array is `T | undefined` under `noUncheckedIndexedAccess`, and a JSDoc'd nullable is `T | null`.
// Suppressing the CODES and not `strictNullChecks` keeps the union in the type, so the value still
// travels the dynamic path and still gets checked -- at run time, which is where a dynamic value's
// check belongs (plan-notes 180).

var xs = [10, 20, 30];
var i = 1;
console.log(xs[i] + xs[0]);
console.log(xs[i]);
console.log(xs[9]);

var words = ["alpha", "beta"];
console.log(words[0]);
console.log(words[1] + "!");

/** @type {?string} */
var maybe = "present";
console.log(maybe);

/** @type {{ a: number } | undefined} */
var box = { a: 7 };
console.log(box.a);

/** @type {(function(number): number) | undefined} */
var fn = function (n) { return n * 2; };
console.log(fn(21));

var nested = [[1, 2], [3, 4]];
console.log(nested[1][0]);
