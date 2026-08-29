// The Phase 2 Check's second program: let/while, mutation, and a value large enough that a
// float-formatting bug would show up in the output rather than hiding in the low bits.
let a: number = 0;
let b: number = 1;
let i: number = 0;
while (i < 30) {
  const next: number = a + b;
  a = b;
  b = next;
  i = i + 1;
}
console.log(a);
