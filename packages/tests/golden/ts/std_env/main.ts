// `std/env` end to end (docs/STD.md §5 `std/env` row, T10.1 step 2): first-party libc
// environment access — real `getenv`/`setenv`/`unsetenv` under `std`-shaped TS names
// (`env.d.ts`), through the thin typed wrapper (`env.ts`). The NULL-return throw path is
// the `@statorError null` convention's own message (cf. extern_libm's getEnvChecked),
// so the golden holds the convention, not a wrapper string.
//
// The read key is `TZ`: the golden runner pins `TZ=UTC` on BOTH sides (run.ts PINNED_ENV),
// so no extra environment setup is needed and the oracle agrees by construction. The
// write/read/unset cycle uses a `STATOR_`-prefixed scratch name the runner never sets.
import { get, set, unset } from "./env.ts";

console.log(get("TZ"));
set("STATOR_STD_ENV_SCRATCH", "hello-std");
console.log(get("STATOR_STD_ENV_SCRATCH"));
unset("STATOR_STD_ENV_SCRATCH");
try {
  get("STATOR_STD_ENV_SCRATCH");
  console.log("unset: no throw");
} catch (e) {
  if (e instanceof Error) {
    console.log("caught: " + e.message);
  }
}
export {};
