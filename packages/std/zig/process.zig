//! `std/process` backings (docs/STD.md §5): the current process's identity, clock and memory,
//! and its two ways out. `argv` and the exit status are not here: they are `main`'s, so they live
//! in the runtime (packages/runtime/src/jsrt_process.c) and this archive keeps calling only libc.

const std = @import("std");
const builtin = @import("builtin");
const root = @import("jsrt_std.zig");

/// Exit status 0–255 (the portable range: POSIX keeps only the low 8 bits, so a wider value
/// would exit with a status the program never wrote). Out of range is EINVAL. `exit` and
/// `setExitCode` share this one check.
fn statusArg(code: f64) ?c_int {
    return root.intIn(code, 0, 255);
}

/// libc `exit` flushes stdio, which is where `console.log` buffers its output, and runs no
/// pending microtasks — the documented contract, not an accident (docs/STD.md §5). Out of range
/// the process keeps running.
export fn jsrt_std_process_exit(code: f64) f64 {
    const status = statusArg(code) orelse return root.fail("EINVAL");
    std.c.exit(status);
}

/// 0 when `code` is a status `setExitCode` may store in the runtime's slot, else EINVAL.
export fn jsrt_std_process_check_status(code: f64) f64 {
    _ = statusArg(code) orelse return root.fail("EINVAL");
    return 0;
}

export fn jsrt_std_process_pid() f64 {
    return @floatFromInt(std.c.getpid());
}

export fn jsrt_std_process_ppid() f64 {
    return @floatFromInt(std.c.getppid());
}

export fn jsrt_std_process_abort() void {
    std.c.abort();
}

/// The running executable's absolute path with symbolic links resolved (`_NSGetExecutablePath`
/// plus `realpath` on Darwin, `/proc/self/exe` on Linux) — libuv's `uv_exepath`, which is what
/// Node's `process.execPath` reports.
export fn jsrt_std_process_exec_path() f64 {
    const path = std.process.executablePathAlloc(root.io(), root.allocator) catch |err| return root.failWith(err);
    root.setResult(path);
    return 0;
}

/// The monotonic clock in nanoseconds from an arbitrary origin (`CLOCK_MONOTONIC`), the clock
/// Node's `process.hrtime` reads. An f64 holds it exactly below 2^53 ns, about 104 days of uptime.
export fn jsrt_std_process_hrtime_ns() f64 {
    var ts: std.c.timespec = undefined;
    if (std.c.clock_gettime(.MONOTONIC, &ts) != 0) return 0;
    return @as(f64, @floatFromInt(ts.sec)) * 1e9 + @as(f64, @floatFromInt(ts.nsec));
}

/// Resident set size in bytes, as libuv's `uv_resident_set_memory` measures it: the Mach task's
/// `resident_size` on Darwin, `/proc/self/statm`'s second field in pages on Linux. A size cannot
/// share the status return, so failure is `-1` after recording `EIO`.
export fn jsrt_std_process_rss() f64 {
    const bytes = residentBytes() orelse {
        _ = root.fail("EIO");
        return -1;
    };
    return @floatFromInt(bytes);
}

fn residentBytes() ?u64 {
    switch (builtin.os.tag) {
        .macos => {
            var info: std.c.mach_task_basic_info = undefined;
            var count: std.c.mach_msg_type_number_t = std.c.MACH.TASK.BASIC.INFO_COUNT;
            const rc = std.c.task_info(std.c.mach_task_self(), std.c.MACH.TASK.BASIC.INFO, @ptrCast(&info), &count);
            if (rc != 0) return null;
            return info.resident_size;
        },
        .linux => {
            var buf: [128]u8 = undefined;
            const text = std.Io.Dir.cwd().readFile(root.io(), "/proc/self/statm", &buf) catch return null;
            var fields = std.mem.tokenizeScalar(u8, text, ' ');
            _ = fields.next() orelse return null;
            const pages = std.fmt.parseInt(u64, fields.next() orelse return null, 10) catch return null;
            return pages * std.heap.pageSize();
        },
        else => return null,
    }
}
