//! The runtime's memory core in Zig (plan.md T9.1, plan-notes 238): the GC glue, the growable
//! buffers, the shape table and the value allocation helpers. The justfile builds this root into
//! one object, `jsrt_zig.o`, and archives it into libjsrt.a beside the C objects. Every symbol it
//! exports is a C-ABI function or variable declared in jsrt.h, jsrt_value.h or src/jsrt_mem.h.

const std = @import("std");

/// The C headers are the single definition of every layout this code touches: jsrt_value.h stays
/// the codegen<->runtime contract, and Zig compiles against it rather than a mirrored copy.
/// `jsrt_env_copy_slots` is renamed on the way in only because Zig 0.16's translate-c derives a
/// `slots` method from it that collides with JSRTEnv's flexible `slots` member; the symbol itself
/// is defined under its real name in jsrt_alloc.zig. A Zig module never calls through `c` to a
/// symbol Zig defines -- it calls the Zig function -- so no extern and export of one name meet.
pub const c = @cImport({
    @cDefine("jsrt_env_copy_slots", "jsrt_env_copy_slots_translate_c_alias");
    @cInclude("jsrt.h");
    @cInclude("jsrt_value.h");
    @cInclude("jsrt_mem.h");
});

/// A boxed value's payload is its low 48 bits; a raw pointer's top 16 bits are zero (jsrt_init
/// asserts that), so masking is the identity on raw pointers.
pub const payload_mask: c.jsrt_value = c.JSRT_PAYLOAD_MASK;

/// Safety checks (ReleaseSafe in the ASan flavor) end in jsrt_panic like every other runtime
/// failure, so a Zig bounds or overflow trap reads the same as a C-side panic.
pub const panic = std.debug.FullPanic(panicCall);

fn panicCall(msg: []const u8, _: ?usize) noreturn {
    @branchHint(.cold);
    var buf: [256]u8 = undefined;
    const n = @min(msg.len, buf.len - 1);
    @memcpy(buf[0..n], msg[0..n]);
    buf[n] = 0;
    c.jsrt_panic(&buf);
}

/// `malloc`, or the panic every runtime allocation site gives when it answers NULL. A zero-byte
/// request may legitimately answer NULL, so only a non-zero one is a failure.
pub fn mallocOrPanic(bytes: usize, what: [*:0]const u8) ?*anyopaque {
    const p = std.c.malloc(bytes);
    if (p == null and bytes > 0) c.jsrt_panic(what);
    return p;
}

/// `realloc`, panicking with `what` on failure (every caller asks for a non-zero size).
pub fn reallocOrPanic(ptr: ?*anyopaque, bytes: usize, what: [*:0]const u8) *anyopaque {
    return std.c.realloc(ptr, bytes) orelse c.jsrt_panic(what);
}

comptime {
    _ = @import("jsrt_gc.zig");
    _ = @import("jsrt_buf.zig");
}
