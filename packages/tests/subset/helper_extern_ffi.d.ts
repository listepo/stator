// Shared declarations for the subset_extern_{object,array,fn,string,catchall,
// varargs}_js + subset_extern_{object,array,fn,string,catchall,varargs}_ts decision
// fixtures (docs/FFI.md sections 1-2): the extern signatures whose call sites the
// fixtures pin. Pulled into each entry's program with a `/// <reference path />`; the
// gate walks every marked declaration where it is written (gate.ts
// gateExternDeclarations), so each fixture's verdict is its own call-site diagnostic
// plus the shared declaration walk — adjudicated per fixture, never bulk.
// The C symbols never need to exist: decision fixtures run `explain`, never a link.

/** Borrowed NUL-terminated UTF-8 at the FFI boundary (docs/FFI.md section 3). */
type CString = string & { readonly __statorCstr: "CString" };

/** @statorExtern */
declare function cAdd(a: number, b: number): number;

/** @statorExtern */
declare function cTakeAny(x: any): number;

/** @statorExtern */
declare function cTakeUnknown(x: unknown): number;

/** @statorExtern */
declare function cTakeObject(o: { x: number }): number;

/** @statorExtern */
declare function cTakeArray(a: number[]): number;

/** @statorExtern */
declare function cTakeFn(cb: (x: number) => number): number;

/** @statorExtern */
declare function cTakeString(s: string): number;

/** @statorExtern */
declare function cTakeVoid(v: void): number;

/** @statorExtern */
declare function cSum(first: number, ...rest: number[]): number;

/** @statorExtern */
declare function cPick(x: number): number;

/** @statorExtern */
declare function cPick(x: string): number;
