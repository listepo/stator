// @mode: js
// @verdict: dynamic
// SUBSET.md: Uint8Array and ArrayBuffer
// An UNTYPED receiver: `bytes` is an implicit-any parameter, so `.length`, `.subarray`, `[i]` and
// the element write go through the shape-table tier, where `jsrt_typed_get_prop` and
// `jsrt_dyn_index_get`/`_set` answer for a typed array exactly as the static rows do.
function sum(bytes) {
  let total = 0;
  for (let i = 0; i < bytes.length; i++) {
    total += bytes[i];
  }
  bytes[0] = 256;
  return total + bytes.subarray(1).byteLength;
}
console.log(sum(new Uint8Array([1, 2, 3])));
