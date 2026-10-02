//! `std/fs` backings (docs/STD.md §5): sync, path-only file-system calls through Zig's std.Io, so
//! the POSIX and (later) Windows answers come from one implementation. Paths are relative to the
//! working directory or absolute, exactly as the OS resolves them; nothing here normalizes.

const std = @import("std");
const root = @import("jsrt_std.zig");

fn cwd() std.Io.Dir {
    return std.Io.Dir.cwd();
}

/// The whole file, NUL-terminated for the `CString` copy. A NUL byte inside the file therefore
/// ends the text early — the C-string boundary's documented truncation (docs/FFI.md §3); byte
/// reads arrive with typed arrays (T11.3).
export fn jsrt_std_fs_read_text(path: [*:0]const u8) f64 {
    const data = cwd().readFileAllocOptions(root.io(), std.mem.span(path), root.allocator, .unlimited, .of(u8), 0) catch |err| return root.failWith(err);
    root.setResult(data);
    return 0;
}

/// Creates or truncates the file, mode 0666 before the umask.
export fn jsrt_std_fs_write_text(path: [*:0]const u8, text: [*:0]const u8) f64 {
    return root.status(cwd().writeFile(root.io(), .{ .sub_path = std.mem.span(path), .data = std.mem.span(text) }));
}

const Kind = enum(u8) { other = 0, file = 1, directory = 2 };

var stat_size: f64 = 0;
var stat_kind: Kind = .other;
var stat_mtime_ms: f64 = 0;

/// Follows symlinks (`stat`, not `lstat`). The fields are parked for the three readers below,
/// which the TS wrapper calls immediately after a successful call.
export fn jsrt_std_fs_stat(path: [*:0]const u8) f64 {
    const st = cwd().statFile(root.io(), std.mem.span(path), .{}) catch |err| return root.failWith(err);
    stat_size = @floatFromInt(st.size);
    stat_kind = switch (st.kind) {
        .file => .file,
        .directory => .directory,
        else => .other,
    };
    stat_mtime_ms = @floatFromInt(st.mtime.toMilliseconds());
    return 0;
}

export fn jsrt_std_fs_stat_size() f64 {
    return stat_size;
}

export fn jsrt_std_fs_stat_kind() f64 {
    return @floatFromInt(@intFromEnum(stat_kind));
}

export fn jsrt_std_fs_stat_mtime_ms() f64 {
    return stat_mtime_ms;
}

/// One level, mode 0777 before the umask; an existing path is EEXIST.
export fn jsrt_std_fs_mkdir(path: [*:0]const u8) f64 {
    return root.status(cwd().createDir(root.io(), std.mem.span(path), .default_dir));
}

export fn jsrt_std_fs_unlink(path: [*:0]const u8) f64 {
    return root.status(cwd().deleteFile(root.io(), std.mem.span(path)));
}

/// Empty directories only; a non-empty one is ENOTEMPTY.
export fn jsrt_std_fs_rmdir(path: [*:0]const u8) f64 {
    return root.status(cwd().deleteDir(root.io(), std.mem.span(path)));
}
