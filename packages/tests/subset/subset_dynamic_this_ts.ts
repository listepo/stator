// @mode: ts
// @verdict: error
// @code: STA0012
// SUBSET.md: an unannotated `this` is implicit `any`, refused in ts mode; js mode binds it
// dynamically instead (docs/VALUE.md §4.16 `has_receiver`).

function f() {
  return typeof this;
}
console.log(f());
