// @mode: ts
// @verdict: static
// SUBSET.md: std/* imports — `std/io`, raw writes and reads on file descriptors (docs/STD.md
// §5); proved by the `std_io` golden.
import { isatty, stdout, write } from "std/io";

write(stdout, `${isatty(stdout)}\n`);
