// slot.d.ts — the v0.1 out-slot spelling for C `T**` out-params.
//
// A caller-created slot crosses the boundary where C takes `T**`: allocate
// with `outSlot<T>()`, hand the slot to the extern call, read `.value` after
// a successful return. The slot is written by the callee, never by TS code
// (`value` is readonly). Full semantics ride the Out<T> pipeline (parallel
// track); this file is only the spelling both sides share.

// The out-slot: filled in by the extern call, read out of afterwards.
type Out<T> = { readonly value: T };

// Allocate an empty out-slot for a C `T**` out-param.
declare function outSlot<T>(): Out<T>;
