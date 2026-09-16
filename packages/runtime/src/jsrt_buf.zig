//! The growable buffers behind print, JSON and console.table (src/jsrt_mem.h). Plain libc memory:
//! they hold bytes and owned C strings, never jsrt_values, so the collector never needs to see them,
//! and their C callers release them with free().

const std = @import("std");
const mem = @import("jsrt_mem.zig");
const c = mem.c;

export fn jsrt_buf_init(b: *c.JSRTBuf) void {
    b.* = .{ .data = null, .len = 0, .cap = 0 };
}

export fn jsrt_buf_free(b: *c.JSRTBuf) void {
    std.c.free(b.data);
    jsrt_buf_init(b);
}

export fn jsrt_buf_append(b: *c.JSRTBuf, bytes: [*c]const u8, n: usize) void {
    if (b.len + n + 1 > b.cap) {
        var cap: usize = if (b.cap == 0) 64 else b.cap;
        while (b.len + n + 1 > cap) cap *= 2;
        b.data = @ptrCast(mem.reallocOrPanic(b.data, cap, "out of memory: print buffer"));
        b.cap = cap;
    }
    if (n > 0) @memcpy(b.data[b.len..][0..n], bytes[0..n]);
    b.len += n;
    b.data[b.len] = 0;
}

export fn jsrt_buf_puts(b: *c.JSRTBuf, s: [*:0]const u8) void {
    jsrt_buf_append(b, s, std.mem.len(s));
}

export fn jsrt_buf_putc(b: *c.JSRTBuf, ch: u8) void {
    jsrt_buf_append(b, &ch, 1);
}

export fn jsrt_buf_repeat(b: *c.JSRTBuf, ch: u8, n: usize) void {
    for (0..n) |_| jsrt_buf_putc(b, ch);
}

export fn jsrt_buf_take(b: *c.JSRTBuf) [*c]u8 {
    jsrt_buf_putc(b, 0);
    return b.data;
}

export fn jsrt_strvec_init(v: *c.JSRTStrVec) void {
    v.* = .{ .items = null, .len = 0, .cap = 0 };
}

export fn jsrt_strvec_push(v: *c.JSRTStrVec, owned: [*c]u8) void {
    if (v.len == v.cap) {
        v.cap = if (v.cap == 0) 8 else v.cap * 2;
        const bytes = v.cap * @sizeOf([*c]u8);
        v.items = @ptrCast(@alignCast(mem.reallocOrPanic(@ptrCast(v.items), bytes, "out of memory building a console.table")));
    }
    v.items[v.len] = owned;
    v.len += 1;
}

export fn jsrt_strvec_free(v: *c.JSRTStrVec) void {
    for (0..v.len) |i| std.c.free(v.items[i]);
    std.c.free(@ptrCast(v.items));
}

export fn jsrt_strvec_find(v: *const c.JSRTStrVec, name: [*:0]const u8) usize {
    for (0..v.len) |i| {
        if (std.mem.orderZ(u8, @ptrCast(v.items[i]), name) == .eq) return i;
    }
    return std.math.maxInt(usize);
}

export fn jsrt_units_push(b: *c.JSRTUnitBuf, unit: u16) void {
    if (b.len == b.cap) {
        b.cap = if (b.cap == 0) 16 else b.cap * 2;
        const bytes = @as(usize, b.cap) * @sizeOf(u16);
        b.units = @ptrCast(@alignCast(mem.reallocOrPanic(b.units, bytes, "out of memory: JSON.parse string")));
    }
    b.units[b.len] = unit;
    b.len += 1;
}
