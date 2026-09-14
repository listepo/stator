// @mode: ts
// @verdict: error
// @code: STA1104
// SUBSET.md: var declarations, hoisting
// `var` is refused in ts mode no matter what the receiver proves: the js twin of this fixture
// compiles and throws a catchable TypeError at run time (STA2008, plan.md §8 step 20).

function add(v: number): void {
  arr.push(v);
}
add(1);
var arr: number[] = [];
