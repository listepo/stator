// `std/io` (docs/STD.md §5): raw writes to the standard streams, the descriptor refusals, and the
// terminal queries — the runner's stdout is a pipe, never a terminal. All stdout output goes
// through `write`: the oracle's `console.log` is asynchronous on a macOS pipe, so mixing the two
// would test Node's scheduling, not std. unit/std.test.ts proves the console ordering, a real
// read from stdin and a terminal.
import { isatty, read, stderr, stdin, stdout, terminalSize, write, writeBytes } from "std/io";

function attempt(label: string, body: () => void): void {
  try {
    body();
    write(stdout, `${label}: ok\n`);
  } catch (e) {
    if (e instanceof Error) {
      write(stdout, `${label}: ${e.message}\n`);
    }
  }
}

write(stdout, `fds ${stdin} ${stdout} ${stderr}\n`);
write(stdout, "héllo, wörld ✓ 😀\n");
write(stdout, "");
writeBytes(stdout, new Uint8Array([98, 121, 116, 101, 115, 10]));
// A view at an offset passes its own window (docs/FFI.md §2 `Uint8Array` row, T11.3a).
writeBytes(stdout, new Uint8Array([33, 115, 117, 98, 10, 33]).subarray(1, 5));
write(stderr, "to stderr\n");
writeBytes(stderr, new Uint8Array([226, 156, 147, 10]));

attempt("write 99", () => write(99, "x"));
attempt("write -1", () => write(-1, "x"));
attempt("write 1.5", () => write(1.5, "x"));
attempt("writeBytes 99", () => writeBytes(99, new Uint8Array(0)));
attempt("read 99", () => {
  read(99, 4);
});
attempt("read max -1", () => {
  read(stdin, -1);
});
write(stdout, `read 0 bytes: ${read(stdin, 0).length}\n`);

write(stdout, `isatty ${isatty(stdout)} ${isatty(stderr)} ${isatty(99)} ${isatty(-1)} ${isatty(1.5)}\n`);
attempt("terminalSize stdout", () => {
  terminalSize(stdout);
});
attempt("terminalSize 99", () => {
  terminalSize(99);
});
