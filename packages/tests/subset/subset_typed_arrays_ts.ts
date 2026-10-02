// @mode: ts
// @verdict: static
// SUBSET.md: Uint8Array and ArrayBuffer
// The landed surface on statically typed receivers: every constructor form, the four data
// properties, `subarray`/`slice`/`set`, an element WRITE (ToUint8 at the store) and `for-of`.
// Each member is one TYPED_OPS row, so nothing here touches the shape table.
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
