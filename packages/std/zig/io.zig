//! `std/io` backings (docs/STD.md §5): the standard streams and raw file-descriptor I/O through
//! libc's `read`/`write`/`isatty`/`ioctl`. Not Zig's std.Io here: it treats `EBADF` as a
//! programmer bug and would panic, where a bad descriptor is the caller's input and answers
//! `EBADF` (docs/STD.md §3).

const std = @import("std");
const root = @import("jsrt_std.zig");

extern "c" fn fflush(stream: ?*anyopaque) c_int;
extern "c" fn ioctl(fd: c_int, request: c_ulong, ...) c_int;

/// A descriptor argument: an integer in `0..2^31-1`, the range Node's `isatty` accepts. Anything
/// else names no open file.
fn fdArg(fd: f64) ?c_int {
    return root.intIn(fd, 0, std.math.maxInt(c_int));
}

/// One `read(2)` or `write(2)`, retried while it is interrupted (`EINTR`): the byte count, or
/// the errno that ended it.
const Transfer = struct { count: usize = 0, err: std.c.E = .SUCCESS };

fn transfer(comptime op: anytype, fd: c_int, ptr: anytype, len: usize) Transfer {
    while (true) {
        const n = op(fd, ptr, len);
        if (n >= 0) return .{ .count = @intCast(n) };
        const err = std.c.errno(n);
        if (err != .INTR) return .{ .err = err };
    }
}

/// Writes all of `data`, retrying `EINTR` and short writes; an empty write still makes the call,
/// so a bad descriptor is `EBADF` either way. C stdio is flushed first: `console.log` buffers in
/// `stdout`, and a write that overtook that buffer would reorder the program's own output.
fn writeAll(fd: c_int, data: []const u8) f64 {
    _ = fflush(null);
    var rest = data;
    while (true) {
        const step = transfer(std.c.write, fd, rest.ptr, rest.len);
        if (step.err != .SUCCESS) return root.failErrno(step.err);
        rest = rest[step.count..];
        if (rest.len == 0) return 0;
    }
}

/// `text` as UTF-8 (the C-string boundary: a NUL ends it, docs/FFI.md §3).
export fn jsrt_std_io_write(fd: f64, text: [*:0]const u8) f64 {
    const f = fdArg(fd) orelse return root.fail("EBADF");
    return writeAll(f, std.mem.span(text));
}

/// The bytes pushed into the byte channel.
export fn jsrt_std_io_write_bytes(fd: f64) f64 {
    const f = fdArg(fd) orelse return root.fail("EBADF");
    return writeAll(f, root.bytesIn());
}

/// The most one `read` asks for, whatever `max` says: the buffer is allocated before the call,
/// and a pipe or terminal answers far less than this anyway.
const read_cap: usize = 1 << 20;

/// One `read(2)` of at most `max` bytes (and at most `read_cap`), parked in the byte channel;
/// zero bytes is end of file.
export fn jsrt_std_io_read(fd: f64, max: f64) f64 {
    const f = fdArg(fd) orelse return root.fail("EBADF");
    const want = root.intIn(max, 0, std.math.maxInt(c_int)) orelse return root.fail("EINVAL");
    const buf = root.allocator.alloc(u8, @min(@as(usize, @intCast(want)), read_cap)) catch return root.fail("ENOMEM");
    const step = transfer(std.c.read, f, buf.ptr, buf.len);
    if (step.err != .SUCCESS) {
        root.allocator.free(buf);
        return root.failErrno(step.err);
    }
    const got = root.allocator.realloc(buf, step.count) catch {
        root.allocator.free(buf);
        return root.fail("ENOMEM");
    };
    root.setBytes(got);
    return 0;
}

/// Node's `tty.isatty`: false for a descriptor outside `0..2^31-1` or one that is not a terminal,
/// never an error.
export fn jsrt_std_io_isatty(fd: f64) f64 {
    const f = fdArg(fd) orelse return 0;
    return if (std.c.isatty(f) == 1) 1 else 0;
}

var size_columns: f64 = 0;
var size_rows: f64 = 0;

/// The terminal's size (`TIOCGWINSZ`), parked for the two readers below. A descriptor that is
/// not a terminal is `ENOTTY`, one that names no open file `EBADF`.
export fn jsrt_std_io_terminal_size(fd: f64) f64 {
    const f = fdArg(fd) orelse return root.fail("EBADF");
    var ws: std.posix.winsize = undefined;
    const rc = ioctl(f, @intCast(std.c.T.IOCGWINSZ), &ws);
    // Darwin refuses a pipe with an errno other than ENOTTY (the std_io golden caught it), so
    // every refusal except a closed descriptor reads as "not a terminal", as `tty.isatty` says.
    if (rc != 0) return root.fail(if (std.c.errno(rc) == .BADF) "EBADF" else "ENOTTY");
    size_columns = @floatFromInt(ws.col);
    size_rows = @floatFromInt(ws.row);
    return 0;
}

export fn jsrt_std_io_terminal_columns() f64 {
    return size_columns;
}

export fn jsrt_std_io_terminal_rows() f64 {
    return size_rows;
}
