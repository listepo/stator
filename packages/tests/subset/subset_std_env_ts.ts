// @mode: ts
// @verdict: dynamic
// SUBSET.md: std/* imports — `std/env` resolves to packages/std/src/env.ts (docs/STD.md §1, §5).
// The std module is ordinary strict TypeScript once resolved and the verdict covers the whole
// module graph, so it is `dynamic`: `get` answers `string | undefined`, a union the HIR boxes.
// The byte-for-byte proof is the `std_env` golden.
import { get, has } from "std/env";

console.log(has("TZ"), get("TZ"));
