// The answer buffer of a descriptor read (`std/io.read`, `std/fs.read`). The backing reads
// straight into the view's storage (docs/FFI.md §2), so the view is allocated before the call.

/** The most one read asks for, whatever `max` says: a pipe or terminal answers far less anyway. */
const READ_CAP: number = 1048576;

/** A view of `min(max, 1 MiB)` bytes; empty for a `max` that is not positive (the backing then
 * judges `max` itself, so an invalid one is still EINVAL). */
export function __stdReadView(max: number): Uint8Array {
  return new Uint8Array(max > 0 ? Math.min(Math.trunc(max), READ_CAP) : 0);
}

/** The bytes a read of `count` left in `into`: `into` itself when it filled, else one copy. */
export function __stdReadAnswer(into: Uint8Array, count: number): Uint8Array {
  return count === into.length ? into : into.slice(0, count);
}
