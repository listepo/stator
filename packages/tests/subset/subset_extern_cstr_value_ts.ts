// @mode: ts
// @verdict: static
// SUBSET.md: FFI — a `CString` value is a string (docs/FFI.md section 3, plan-notes 311). A
// binding and an arrow whose types are inferred from an extern's `CString` return are static:
// the return was copied into a runtime string at the boundary, and the brand is a phantom.
/// <reference path="./helper_extern_cstr.d.ts" />

function join(count: number, at: (index: number) => string): string {
  let out = '';
  for (let i = 0; i < count; i++) {
    out += at(i);
  }
  return out;
}

const echoed = cEcho('hello' as CString);
console.log(echoed, join(2, (i) => cEcho(`${i}` as CString)));
export {};
