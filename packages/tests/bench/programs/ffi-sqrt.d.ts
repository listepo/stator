// ffi-sqrt extern declaration (docs/FFI.md): system libm `sqrt` whose true C
// signature `double sqrt(double)` matches the ABI mapping exactly — the landed
// spelling from packages/tests/golden/ts/extern_libm/libm.d.ts.

/** @statorExtern */
declare function sqrt(x: number): number;
