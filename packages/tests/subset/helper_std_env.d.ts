// Shared declarations for the subset_std_env_* decision fixtures (docs/STD.md §5,
// T10.1 step 2): the `std/env` surface — real libc getenv/setenv/unsetenv under
// `std`-shaped TS names. One declaration file, one verdict family: every signature
// here is accepted, so the declaration walk stays silent and each fixture's verdict
// is its own call-site diagnostic (the helper_extern_direct.d.ts rule). The `#include`
// pragma is load-bearing (cf. the golden's env.d.ts): without the true `<stdlib.h>`
// prototypes the emitter's fallbacks conflict with libc at the clang line.

// @statorLink #include <stdlib.h>

/** Borrowed NUL-terminated UTF-8 at the FFI boundary (docs/FFI.md section 3). */
type CString = string & { readonly __statorCstr: "CString" };

/** @statorExtern getenv @statorError null */
declare function stdEnvGet(name: CString): CString;

/** @statorExtern setenv */
declare function stdEnvSet(name: CString, value: CString, overwrite: number): number;

/** @statorExtern unsetenv */
declare function stdEnvUnset(name: CString): number;
