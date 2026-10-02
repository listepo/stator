// @mode: ts
// @verdict: static
// SUBSET.md: std/* imports — `std/encoding`, text ↔ bytes as Node's `Buffer` converts them
// (docs/STD.md §5); proved by the `std_encoding` golden.
import { bytesToHex, utf8ToBytes } from "std/encoding";

console.log(bytesToHex(utf8ToBytes("é")));
