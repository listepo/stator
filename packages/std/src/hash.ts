// `std/hash` — digests and secure random bytes (docs/STD.md §5). Digests are Zig's `std.crypto`
// (packages/std/zig/hash.zig) over bytes; text is hashed as its UTF-8, as Node's `update(text)`
// hashes it. Each answer is a fresh `Uint8Array`; `std/encoding.bytesToHex` spells it.

import { jsrtStdHashDigest, jsrtStdHashRandomBytes } from './native/hash.js';
import { __stdFailure } from './internal/error.ts';
import { utf8ToBytes } from './encoding.ts';

/** The backing writes the digest of `kind` into a view of its exact `size`. */
function __stdHashDigest(
  data: Uint8Array | string,
  kind: number,
  size: number,
  name: string,
): Uint8Array {
  const out = new Uint8Array(size);
  if (jsrtStdHashDigest(kind, typeof data === 'string' ? utf8ToBytes(data) : data, out) !== 0) {
    throw __stdFailure(`std/hash.${name}`, '');
  }
  return out;
}

/** The SHA-256 digest (32 bytes) of `data`, or of a string's UTF-8. */
export function sha256(data: Uint8Array | string): Uint8Array {
  return __stdHashDigest(data, 0, 32, 'sha256');
}

/** The SHA-1 digest (20 bytes). Broken for collision resistance; for interop only. */
export function sha1(data: Uint8Array | string): Uint8Array {
  return __stdHashDigest(data, 1, 20, 'sha1');
}

/** The MD5 digest (16 bytes). Broken for collision resistance; for interop only. */
export function md5(data: Uint8Array | string): Uint8Array {
  return __stdHashDigest(data, 2, 16, 'md5');
}

/** `size` bytes from the OS's secure random source. `size` outside `0..2^31-1` is EINVAL. */
export function randomBytes(size: number): Uint8Array {
  // An invalid size gets an empty view; the backing validates `size` itself and answers EINVAL.
  const valid = size >= 0 && size <= 0x7fffffff && Math.trunc(size) === size;
  const out = new Uint8Array(valid ? size : 0);
  if (jsrtStdHashRandomBytes(size, out) !== 0) {
    throw __stdFailure('std/hash.randomBytes', `${size}`);
  }
  return out;
}
