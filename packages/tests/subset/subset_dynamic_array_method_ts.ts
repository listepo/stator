// @mode: ts
// @verdict: error
// @code: STA1003
// SUBSET.md: implicit any
// An unannotated parameter is implicit `any`, refused in ts mode. The js twin of this fixture
// compiles the same source to the dynamic path (plan.md §8 step 20).

function pushIt(a) {
  a.push(9);
  return a.length;
}
console.log(pushIt([1, 2]));
