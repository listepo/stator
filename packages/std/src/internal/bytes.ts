// The byte channel's TypeScript end (docs/STD.md §6): a `Uint8Array` goes in one `push` per byte
// and comes back one `at` per byte, because an extern signature cannot name a `Uint8Array`
// (docs/FFI.md §2, STA1115). O(n) direct calls, no copy held on either side past the next call.

import {
  jsrtStdBytesAt,
  jsrtStdBytesClear,
  jsrtStdBytesLength,
  jsrtStdBytesPush,
} from '../native/core.js';

/** Loads `data` into the channel for the backing called next. */
export function __stdBytesIn(data: Uint8Array): void {
  jsrtStdBytesClear();
  for (const byte of data) {
    jsrtStdBytesPush(byte);
  }
}

/** A fresh `Uint8Array` holding the bytes the last backing parked. */
export function __stdBytesOut(): Uint8Array {
  const length = jsrtStdBytesLength();
  const out = new Uint8Array(length);
  for (let i = 0; i < length; i++) {
    out[i] = jsrtStdBytesAt(i);
  }
  return out;
}
