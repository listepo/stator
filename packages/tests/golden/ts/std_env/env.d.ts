// `std/env` binding declarations (docs/STD.md §5, docs/FFI.md §§1–2, 9): first-party
// libc environment access behind the extern surface. One declaration file, one verdict
// family: every signature here is accepted, so the declaration walk stays silent and each
// fixture's verdict is its own call-site diagnostic (cf. helper_extern_direct.d.ts).
// The C symbols are real libc (`getenv`/`setenv`/`unsetenv`); the C names ride the
// `@statorExtern` override while the TS names stay `std`-shaped. The `#include` pragma
// is load-bearing, not decoration: without the true `<stdlib.h>` prototypes the emitter's
// fallback forward declarations (`double setenv(...)`, `double unsetenv(...)`) conflict
// with libc at the clang line, loudly, by design (cf. extern_ptr/stdlib.d.ts).

// @statorLink #include <stdlib.h>

/** Borrowed NUL-terminated UTF-8 at the FFI boundary (docs/FFI.md section 3). */
type CString = string & { readonly __statorCstr: "CString" };

/** @statorExtern getenv @statorError null */
declare function stdEnvGet(name: CString): CString;

/** @statorExtern setenv */
declare function stdEnvSet(name: CString, value: CString, overwrite: number): number;

/** @statorExtern unsetenv */
declare function stdEnvUnset(name: CString): number;
