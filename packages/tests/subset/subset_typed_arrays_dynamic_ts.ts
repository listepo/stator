// @mode: ts
// @verdict: dynamic
// SUBSET.md: Uint8Array and ArrayBuffer
// An element READ: under `noUncheckedIndexedAccess` `bytes[i]` is `number | undefined`, because
// out of range it really is `undefined` -- the same Unknown an array read is, narrowed back by
// the `??`.
function sum(bytes: Uint8Array): number {
  let total = 0;
  for (let i = 0; i < bytes.length; i++) {
    total += bytes[i] ?? 0;
  }
  return total;
}
console.log(sum(new Uint8Array([1, 2, 3])));
