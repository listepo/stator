// @mode: js
// @verdict: dynamic
// SUBSET.md: array index access

// Indexing an array is `T | undefined` under `noUncheckedIndexedAccess`, so the checker refuses
// `xs[i] + 1` as "Object is possibly 'undefined'" -- 3855 of Task 6.1's 10,513 Test262 failures,
// the largest bucket by a factor of three, and all of it JavaScript that runs. js mode suppresses
// the CODE and not the option: the union stays in the type, so the value lowers to the dynamic
// path and the check still happens at run time (plan.md §8 step 2a, plan-notes 180).
var xs = [10, 20, 30];
var i = 1;
console.log(xs[i] + 1);
