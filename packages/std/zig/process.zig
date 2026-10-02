//! `std/process` backings (docs/STD.md §5): the current process's identity and its two ways out.

const std = @import("std");
const root = @import("jsrt_std.zig");

/// Exit status 0–255 (the portable range: POSIX keeps only the low 8 bits, so a wider value
/// would exit with a status the program never wrote). Out of range is EINVAL and the process
/// keeps running. libc `exit` flushes stdio, which is where `console.log` buffers its output, and
/// runs no pending microtasks — the documented contract, not an accident (docs/STD.md §5).
export fn jsrt_std_process_exit(code: f64) f64 {
    const status = root.intIn(code, 0, 255) orelse return root.fail("EINVAL");
    std.c.exit(status);
}

export fn jsrt_std_process_pid() f64 {
    return @floatFromInt(std.c.getpid());
}

export fn jsrt_std_process_abort() void {
    std.c.abort();
}
