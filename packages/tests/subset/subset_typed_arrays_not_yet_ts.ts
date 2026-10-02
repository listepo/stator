// @mode: ts
// @verdict: not-yet
// @code: STA1214
// SUBSET.md: Uint8Array and ArrayBuffer
// The rest of `Uint8Array.prototype` is the family's later surface (plan.md §11c T11.1 lands it
// as the corpus needs it), refused by its qualified name rather than mis-dispatched.
const bytes = new Uint8Array(4);
bytes.fill(7);
console.log(bytes);
