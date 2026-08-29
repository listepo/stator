// js mode accepts untyped source. The checker still infers number here, so this compiles static;
// the fixture exists to prove the js path reaches codegen at all, not to exercise the dynamic
// representation (which arrives with Phase 8).
let total = 0;
let i = 1;
while (i <= 10) {
  total = total + i;
  i = i + 1;
}
console.log(total);
console.log('done');
