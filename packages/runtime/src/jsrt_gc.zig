//! The one collected allocation, and the two hooks that make it correct (docs/VALUE.md §4.12).
//!
//! Boehm is a CONSERVATIVE collector: it scans memory word by word and retains anything that
//! looks like a heap address. A jsrt_value is not one. NaN-boxing puts the tag above bit 48, so a
//! boxed reference never looks like a pointer -- the collector walks straight past every value a
//! Map, an array, an object slot or a stack frame holds, and frees objects that are still live
//! (plan-notes 108: without these hooks a forced collection over a 200-entry Map SIGSEGVs).
//!
//! Boehm 8.2 has no GC_set_pointer_mask, so the two places a reference can hide each get an
//! explicit hook that unboxes before testing:
//!
//!   - the heap, via a custom object kind whose mark procedure masks every word it scans. Every
//!     collected allocation in the runtime comes from jsrt_gc_alloc, so the kind covers all of it.
//!   - the roots, via GC_set_push_other_roots over the JSRT_FRAME shadow stack. The hook CHAINS
//!     to the one it replaces: in a threads-enabled Boehm (every packaged one) that default is
//!     GC_push_all_stacks, i.e. the C stack and registers themselves. Replacing it outright meant a
//!     raw pointer in a runtime local was no root at all, and a function that allocates twice -- a
//!     Map's entries then its index, an array's header then its elements -- lost the first block to
//!     the second allocation's collection (plan-notes 163).
//!
//! Masking is safe for BOTH word shapes the runtime stores: a boxed value's payload is its low 48
//! bits, and a raw pointer's top 16 bits are zero, so the mask is the identity on raw pointers. A
//! word that is neither -- a double, a length -- can mask to a plausible address and retain one
//! object it does not own. That is ordinary conservative-collector behaviour: it costs memory,
//! never correctness.
//!
//! Without Boehm this is plain malloc and no collection, which is the configuration every machine
//! without bdw-gc installed builds. The justfile passes -DJSRT_HAVE_BOEHM to this object exactly
//! when it passes it to the C objects, and @cImport makes that macro visible here.

const std = @import("std");
const mem = @import("jsrt_mem.zig");
const c = mem.c;

/// Whether collected memory is Boehm's. Without it a collected block is plain malloc and is freed
/// by whoever drops it (jsrt_shape.zig's slot growth).
pub const boehm = @hasDecl(c, "JSRT_HAVE_BOEHM");

const impl = if (boehm) struct {
    const gc = @cImport({
        @cInclude("gc.h");
        @cInclude("gc/gc_mark.h");
    });

    var kind: c_int = 0;

    /// The hook installed before ours: the C stack and registers of every thread in a
    /// threads-enabled Boehm, NULL in a single-threaded one (which scans its stack without a hook).
    var default_push_other_roots: gc.GC_push_other_roots_proc = null;

    fn mark(
        addr: [*c]gc.GC_word,
        msp: ?*gc.struct_GC_ms_entry,
        msl: ?*gc.struct_GC_ms_entry,
        env: gc.GC_word,
    ) callconv(.c) ?*gc.struct_GC_ms_entry {
        _ = env;
        // The header's size, so this works for every allocation shape the runtime has -- a fixed
        // struct, a flexible array member, a bare jsrt_value buffer -- without any of them carrying
        // a layout descriptor. It rounds up to the granule, so the tail may scan padding; padding is
        // inside the object's own block and cleared, so reading it is harmless.
        //
        // A mark procedure can also be handed a cleared object on a free list, whose first word is
        // a free-list link. Masking a raw pointer is the identity, so that word marks the next free
        // object: it retains one dead object for a cycle, and cannot corrupt anything.
        const words = gc.GC_size(addr) / @sizeOf(gc.GC_word);
        const least = @intFromPtr(gc.GC_least_plausible_heap_addr);
        const greatest = @intFromPtr(gc.GC_greatest_plausible_heap_addr);
        var sp = msp;
        for (0..words) |i| {
            const p = addr[i] & mem.payload_mask;
            // GC_MARK_AND_PUSH: the macro's plausibility test, then the call it guards.
            if (p >= least and p <= greatest) {
                sp = gc.GC_mark_and_push(@ptrFromInt(p), sp, msl, @ptrCast(&addr[i]));
            }
        }
        return sp;
    }

    /// Roots are pushed a chunk at a time through a plain array of RAW pointers, because the eager
    /// push scans a memory range conservatively -- which is precisely what fails on a boxed value.
    /// Unboxing into this buffer first is what makes the range scannable. The buffer is dead once
    /// the push returns: GC_push_all_eager marks its contents immediately rather than recording the
    /// range for later.
    const Roots = struct {
        raw: [128]?*anyopaque = undefined,
        n: usize = 0,

        fn add(self: *Roots, p: ?*anyopaque) void {
            self.raw[self.n] = p;
            self.n += 1;
            if (self.n == self.raw.len) self.flush();
        }

        fn flush(self: *Roots) void {
            if (self.n == 0) return;
            gc.GC_push_all_eager(@ptrCast(&self.raw), @ptrCast(self.raw[self.n..].ptr));
            self.n = 0;
        }
    };

    fn pushRoots() callconv(.c) void {
        // First the C stack, conservatively, as if we had never been installed: every raw pointer
        // a runtime function holds in a local across an allocation depends on this. Then the frames.
        if (default_push_other_roots) |push| push();
        var roots: Roots = .{};
        var frame: ?*const c.JSRTFrame = c.jsrt_frame_top;
        while (frame) |f| : (frame = f.prev) {
            for (0..f.count) |i| roots.add(@ptrFromInt(f.slots[i] & mem.payload_mask));
            // Only the environment itself: it is a collected allocation, so the mark procedure
            // above walks its slots and its parent link from here.
            if (f.env != null) roots.add(@ptrCast(f.env));
        }
        // The one root that is not a frame slot: an exception in flight, whose only reference is
        // the mailbox while the `finally` blocks on the way out run -- and allocate.
        roots.add(@ptrFromInt(c.jsrt_pending_slot().* & mem.payload_mask));
        roots.flush();
    }

    fn init() void {
        // GC_INIT() is GC_init() plus configuration hooks, and gc.h leaves every one of them empty
        // on the platforms this runtime builds for (GC_INIT_CONF_ROOTS is non-empty only on
        // Cygwin/MinGW, AIX and dynamic-loading-less Android).
        gc.GC_init();
        kind = @intCast(gc.GC_new_kind(gc.GC_new_free_list(), gc.GC_MAKE_PROC(gc.GC_new_proc(mark), 0), 0, 1));
        default_push_other_roots = gc.GC_get_push_other_roots();
        gc.GC_set_push_other_roots(pushRoots);
    }

    fn alloc(bytes: usize) ?*anyopaque {
        return gc.GC_generic_malloc(bytes, kind);
    }
} else struct {
    fn init() void {}

    fn alloc(bytes: usize) ?*anyopaque {
        return std.c.malloc(bytes);
    }
};

/// Called by jsrt_init once the pointer-width assumption holds.
export fn jsrt_gc_init() void {
    impl.init();
}

/// The runtime's ONE collected allocation (jsrt.h). A zero-byte request is a real one -- an empty
/// array literal still wants an element buffer -- and malloc may answer NULL for it, which is
/// indistinguishable from failure, so it asks for one granule instead. Never returns NULL.
pub fn alloc(bytes: usize, what: [*:0]const u8) *anyopaque {
    return impl.alloc(if (bytes == 0) 1 else bytes) orelse oom(what);
}

export fn jsrt_gc_alloc(bytes: usize, what: [*c]const u8) *anyopaque {
    return alloc(bytes, @ptrCast(what));
}

/// "out of memory: <what>", truncated to the 128-byte message the C runtime has always used.
fn oom(what: [*:0]const u8) noreturn {
    @branchHint(.cold);
    const prefix = "out of memory: ";
    var msg: [128]u8 = undefined;
    const name = std.mem.span(what);
    const n = @min(name.len, msg.len - 1 - prefix.len);
    @memcpy(msg[0..prefix.len], prefix);
    @memcpy(msg[prefix.len..][0..n], name[0..n]);
    msg[prefix.len + n] = 0;
    c.jsrt_panic(&msg);
}
