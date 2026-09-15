// @mode: ts
// @verdict: error
// @code: STA1003
// SUBSET.md: implicit any
// An unannotated parameter is implicit `any`, refused in ts mode. The js twin of this fixture
// compiles the same source to the dynamic method path (plan.md §8 step 45).

function callM(o) {
  return o.m();
}
console.log(callM({ m() { return 1; } }));
