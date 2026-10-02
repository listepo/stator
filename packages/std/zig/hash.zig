//! `std/hash` backings (docs/STD.md §5): digests from Zig's `std.crypto` and secure random bytes
//! from `std.Io`. Zig's implementations ship with the toolchain we already pin, are tested
//! against the standard vectors upstream, and need no vendored C — so nothing is vendored.
//!
//! Bytes cross as `Uint8Array` views in place (docs/FFI.md §2): the surface allocates each
//! answer at its final size and the backing fills it, so nothing is parked or copied.

const std = @import("std");
const root = @import("jsrt_std.zig");
const hash = std.crypto.hash;

fn digestInto(comptime H: type, data: []const u8, out: []u8) f64 {
    if (out.len != H.digest_length) return root.fail("EINVAL");
    H.hash(data, out[0..H.digest_length], .{});
    return 0;
}

/// The digest of `data` written into `out`, which must be the digest's size: 0 SHA-256 (32),
/// 1 SHA-1 (20), 2 MD5 (16).
export fn jsrt_std_hash_digest(kind: f64, data: [*]const u8, len: usize, out: [*]u8, out_len: usize) f64 {
    const bytes = data[0..len];
    const into = out[0..out_len];
    return switch (root.intIn(kind, 0, 2) orelse return root.fail("EINVAL")) {
        0 => digestInto(hash.sha2.Sha256, bytes, into),
        1 => digestInto(hash.Sha1, bytes, into),
        else => digestInto(hash.Md5, bytes, into),
    };
}

/// Fills `out` (`size` bytes) from the OS's secure source (`getrandom`/`arc4random_buf` behind
/// `std.Io`). `size` outside `0..2^31-1` is EINVAL, the range Node's `randomBytes` accepts; the
/// surface then passes an empty view, so a view that is not `size` long is EINVAL too.
export fn jsrt_std_hash_random_bytes(size: f64, out: [*]u8, len: usize) f64 {
    const n = root.intIn(size, 0, std.math.maxInt(c_int)) orelse return root.fail("EINVAL");
    if (@as(usize, @intCast(n)) != len) return root.fail("EINVAL");
    root.io().randomSecure(out[0..len]) catch return root.fail("EIO");
    return 0;
}
