// `std/env` — process environment (docs/STD.md §5 `std/env` row, T10.1 step 2).
//
// First-party module, not user FFI: the declarations live in `env.d.ts` (real libc
// `getenv`/`setenv`/`unsetenv` under `std`-shaped TS names), and this file is the thin
// typed wrapper users import. A missing name THROWS through the `@statorError null`
// convention (the `getenv` declaration carries it — a NULL C return is a failed call,
// never an `undefined` value), and the golden holds that message byte-for-byte.
// `set`/`unset` mirror libc's integer answers the same way: nonzero is a throw, zero
// is silence.

/// <reference path="./env.d.ts" />

export function get(name: string): string {
  return stdEnvGet(name as CString);
}

export function set(name: string, value: string): void {
  const status = stdEnvSet(name as CString, value as CString, 1);
  if (status !== 0) {
    throw new Error(`std/env: cannot set '${name}'`);
  }
}

export function unset(name: string): void {
  const status = stdEnvUnset(name as CString);
  if (status !== 0) {
    throw new Error(`std/env: cannot unset '${name}'`);
  }
}
