//! The value allocation helpers jsrt_value.h declares: fixed-layout objects, arrays and their
//! growth, closure environments, closures, rest arrays and dynamic objects. Every block is the one
//! collected allocation (jsrt_gc.zig), and every jsrt_value slot in it is `undefined` before the
//! block is reachable from any root: a conservative collector scans those words before the caller
//! has stored anything, so they must never hold stale bits that happen to look like pointers --
//! the discipline JSRT_FRAME follows for frame slots.

const std = @import("std");
const mem = @import("jsrt_mem.zig");
const gc = @import("jsrt_gc.zig");
const shapes = @import("jsrt_shape.zig");
const c = mem.c;

const Value = c.jsrt_value;
const undefined_value: Value = c.JSRT_UNDEFINED;

fn create(comptime T: type, bytes: usize, what: [*:0]const u8) *T {
    return @ptrCast(@alignCast(gc.alloc(bytes, what)));
}

/// An array's element buffer. Split from the header because the array grows: `elements` is
/// replaced where the header is not.
fn elements(capacity: u32) [*]Value {
    const bytes = @as(usize, capacity) * @sizeOf(Value);
    return @ptrCast(@alignCast(gc.alloc(bytes, "array elements")));
}

/// One allocation, header and slots together: the flexible member is safe because an object's slot
/// count never changes (see the comment on JSRTObject).
export fn jsrt_object_new(cls: *const c.JSRTClass) Value {
    const bytes = @sizeOf(c.JSRTObject) + @as(usize, cls.field_count) * @sizeOf(Value);
    const object = create(c.JSRTObject, bytes, "object");
    object.cls = cls;
    object.frozen = false;
    @memset(object.fields()[0..cls.field_count], undefined_value);
    return c.JSRT_BOX(c.JSRT_TAG_OBJECT, @intFromPtr(object));
}

export fn jsrt_array_new(count: u32, items: [*c]const Value) Value {
    const array = create(c.JSRTArray, @sizeOf(c.JSRTArray), "array");
    // An empty literal still gets a one-element buffer, so `elements` is never NULL and every path
    // can index it without a null test.
    const capacity: u32 = if (count > 0) count else 1;
    const buf = elements(capacity);
    if (count > 0) @memcpy(buf[0..count], items[0..count]);
    @memset(buf[count..capacity], undefined_value);
    // No named-property table until something hangs a property off this array (a RegExp match is
    // the only thing that does today), which is what NULL means to the shape table.
    array.* = .{
        .length = count,
        .capacity = capacity,
        .elements = buf,
        .shape = null,
        .slots = null,
        .slot_capacity = 0,
    };
    return c.JSRT_BOX(c.JSRT_TAG_ARRAY, @intFromPtr(array));
}

/// Doubles until `index` fits, so repeated appends stay amortized O(1) rather than O(n) per push.
/// Widened to 64 bits because doubling a capacity near UINT32_MAX would wrap to zero and spin
/// forever; an index that high is a request the allocator would refuse anyway.
export fn jsrt_array_grow(a: *c.JSRTArray, index: u32) void {
    var capacity: u64 = a.capacity;
    while (capacity <= index) capacity *= 2;
    if (capacity > std.math.maxInt(u32)) c.jsrt_panic("array index too large");
    const grown: u32 = @intCast(capacity);
    const buf = elements(grown);
    @memcpy(buf[0..a.length], a.elements[0..a.length]);
    @memset(buf[a.length..grown], undefined_value);
    a.elements = buf;
    a.capacity = grown;
}

export fn jsrt_env_new(parent: ?*c.JSRTEnv, count: u32) *c.JSRTEnv {
    const bytes = @sizeOf(c.JSRTEnv) + @as(usize, count) * @sizeOf(Value);
    const env = create(c.JSRTEnv, bytes, "closure environment");
    env.parent = parent;
    env.count = count;
    @memset(env.slots()[0..count], undefined_value);
    return env;
}

export fn jsrt_env_clone(env: ?*c.JSRTEnv) ?*c.JSRTEnv {
    const src = env orelse return null;
    const copy = jsrt_env_new(src.parent, src.count);
    @memcpy(copy.slots()[0..src.count], src.slots()[0..src.count]);
    return copy;
}

export fn jsrt_env_copy_slots(dst: ?*c.JSRTEnv, src: ?*const c.JSRTEnv) void {
    const to = dst orelse return;
    const from = src orelse return;
    const n = @min(to.count, from.count);
    // copyForwards rather than @memcpy: nothing forbids committing an environment onto itself.
    std.mem.copyForwards(Value, to.slots()[0..n], from.slots()[0..n]);
}

export fn jsrt_closure_new(
    func: @FieldType(c.JSRTClosure, "fn"),
    arity: u32,
    name: [*c]const u8,
    env: ?*c.JSRTEnv,
    has_receiver: bool,
) Value {
    const closure = create(c.JSRTClosure, @sizeOf(c.JSRTClosure), "closure");
    closure.* = .{
        .@"fn" = func,
        .arity = arity,
        .name = name,
        .env = env,
        .has_receiver = has_receiver,
    };
    return c.jsrt_closure(closure);
}

export fn jsrt_args_rest(argc: u32, argv: [*c]const Value, from: u32) Value {
    if (from >= argc) return jsrt_array_new(0, null);
    return jsrt_array_new(argc - from, argv + from);
}

fn dynobjNew(cls: *const c.JSRTClass) Value {
    const o = create(c.JSRTDynObject, @sizeOf(c.JSRTDynObject), "dynamic object slots");
    o.* = .{
        .cls = cls,
        .shape = &shapes.jsrt_shape_root,
        .capacity = 0,
        .slots = null,
        .frozen = false,
    };
    return c.JSRT_BOX(c.JSRT_TAG_OBJECT, @intFromPtr(o));
}

export fn jsrt_dynobj_new() Value {
    return dynobjNew(&c.jsrt_class_dynamic);
}

export fn jsrt_null_proto_new() Value {
    return dynobjNew(&c.jsrt_class_null_proto);
}
