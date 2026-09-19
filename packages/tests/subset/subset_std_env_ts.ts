// @mode: ts
// @verdict: static
// SUBSET.md: std/env — first-party libc environment access (docs/STD.md §5, T10.1
// step 2). The declarations live beside this fixture (`helper_std_env.d.ts`: real
// getenv/setenv/unsetenv under `std`-shaped names); the calls are direct C calls.
// The verdict is the call-site's: `static` + the unchecked-boundary flag alongside
// (docs/FFI.md §5), proved byte-for-byte by the `std_env` golden.
/// <reference path="./helper_std_env.d.ts" />

console.log(stdEnvGet("TZ" as CString));
stdEnvSet("STATOR_STD_ENV_SUBSET" as CString, "x" as CString, 1);
console.log(stdEnvGet("STATOR_STD_ENV_SUBSET" as CString));
stdEnvUnset("STATOR_STD_ENV_SUBSET" as CString);
export {};
