// Extern declarations for the extern_libm golden (docs/FFI.md): system libm/libc symbols
// whose TRUE C signatures match the ABI mapping exactly — `double f(double)`,
// `double f(double, double)`, `double f(const char *)`, `char *f(const char *)`. A symbol
// whose true signature differs in a non-pointer slot (strlen's size_t return) cannot be
// spelled here: the emitted forward declaration would conflict at the clang line, loudly,
// by design — the trust boundary fails closed. (Handles are the exception: since step 6 a
// branded pointer crosses as `void *`, so a `void *`-shaped symbol like `free` spells
// exactly; the `extern_ptr` golden proves that path instead.)

/** Borrowed NUL-terminated UTF-8 at the FFI boundary (docs/FFI.md section 3). */
type CString = string & { readonly __statorCstr: "CString" };

/** @statorExtern */
declare function sqrt(x: number): number;

/** @statorExtern fmod */
declare function fmod2(x: number, y: number): number;

/** @statorExtern atof */
declare function numOf(s: CString): number;

/** @statorExtern getenv */
declare function getEnv(name: CString): CString;

/** @statorExtern fmod @statorError nonzero */
declare function fmodChecked(x: number, y: number): number;

/** @statorExtern log @statorError negative */
declare function logChecked(x: number): number;

/** @statorExtern getenv @statorError null */
declare function getEnvChecked(name: CString): CString;

/** @statorExtern sqrt @statorError errno */
declare function sqrtErrno(x: number): number;
