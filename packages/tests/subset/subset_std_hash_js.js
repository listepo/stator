// @mode: js
// @verdict: dynamic
// SUBSET.md: std/* imports — `std/hash`, digests and random bytes (docs/STD.md §5); proved by the
// `std_hash` golden. Dynamic because a digest takes `Uint8Array | string`, a union the HIR boxes.
import { sha256 } from "std/hash";

console.log(sha256("abc").length);
