// @mode: js
// @verdict: static
// SUBSET.md: Uint8Array and ArrayBuffer
// The same surface in js mode: the checker infers `Uint8Array` / `ArrayBuffer` from the
// constructors, so every member resolves to its TYPED_OPS row without an annotation.
const buffer = new ArrayBuffer(8);
const view = new Uint8Array(buffer, 2, 4);
const copy = new Uint8Array([1, 2, 3]);
const sized = new Uint8Array(4);
sized[0] = 300;
view.set(copy, 1);
const part = view.subarray(1, 3).slice(0, 1);
let total = buffer.byteLength + buffer.slice(1).byteLength + view.byteOffset + part.length;
for (const byte of copy) {
  total += byte;
}
console.log(total, sized.byteLength, view.buffer === buffer, new Uint8Array(view));
