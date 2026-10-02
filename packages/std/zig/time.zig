//! `std/time` backings (docs/STD.md §5): the wall clock, and a sync sleep that blocks the only
//! thread there is — the honest sync API, not a timer (timers need a macrotask phase, N2).

const std = @import("std");
const root = @import("jsrt_std.zig");

/// Milliseconds since the Unix epoch, truncated to an integer like `Date.now()`.
export fn jsrt_std_time_now_ms() f64 {
    return @floatFromInt(std.Io.Clock.real.now(root.io()).toMilliseconds());
}

/// Milliseconds on the monotonic clock, fractions truncated. NaN, a negative or an overlong
/// duration is EINVAL — checked before the float-to-int conversion, which would trap on them.
export fn jsrt_std_time_sleep_ms(ms: f64) f64 {
    if (!(ms >= 0 and ms <= std.math.maxInt(i32))) return root.fail("EINVAL");
    return root.status(root.io().sleep(.fromMilliseconds(@intFromFloat(ms)), .awake));
}
