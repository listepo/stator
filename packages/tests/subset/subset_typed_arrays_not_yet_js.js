// @mode: js
// @verdict: not-yet
// @code: STA1214
// SUBSET.md: Uint8Array and ArrayBuffer
// The statics are not this landing either: `Uint8Array.from` / `.of` and `ArrayBuffer.isView`
// are refused by name in both modes.
const bytes = Uint8Array.from([1, 2, 3]);
console.log(bytes);
